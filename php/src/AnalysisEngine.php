<?php
declare(strict_types=1);
namespace Baize;

/** Exact event-time analytics shared by HTTP reads and the CLI aggregation worker. */
final class AnalysisEngine
{
    public static function ms(string|int|float $ts): float { return is_numeric($ts) ? (float)$ts : (float)(new \DateTimeImmutable($ts))->format('U.u') * 1000; }
    public static function iso(float|int $ms): string { return gmdate('Y-m-d\TH:i:s', (int)floor($ms / 1000)) . sprintf('.%03dZ', ((int)floor($ms) % 1000 + 1000) % 1000); }
    public static function day(string|int|float $ts, string $timezone = 'UTC'): string { return (new \DateTimeImmutable('@' . sprintf('%.3f', self::ms($ts) / 1000)))->setTimezone(new \DateTimeZone($timezone))->format('Y-m-d'); }
    public static function hour(array $event): string { return self::iso(floor(self::ms($event['ts']) / 3600000) * 3600000); }
    public static function timeout(array $site): float { return max(1, min(1440, (float)($site['config']['session_timeout_minutes'] ?? 30))) * 60000; }
    public static function matches(array $e, array $filters): bool { foreach ($filters as $key => $value) if ($value !== '' && $value !== null && ($key === 'path' ? ($e['path'] ?? '') : ($e['dimensions'][$key] ?? null)) !== $value) return false; return true; }
    public static function clean(array $events): array
    {
        $seen = []; $result = [];
        foreach ($events as $e) { if (!empty($e['is_bot']) || !isset($e['event_id'], $e['ts'], $e['visitor_id']) || isset($seen[$e['event_id']])) continue; $seen[$e['event_id']] = true; $e['dimensions'] ??= []; $e['payload'] ??= []; $result[] = $e; }
        usort($result, fn($a, $b) => self::ms($a['ts']) <=> self::ms($b['ts']) ?: strcmp($a['event_id'], $b['event_id'])); return $result;
    }
    public static function sessions(array $events, array $site): array { return Sessionizer::build(self::clean($events), $site); }
    private static function firstPage(array $session): ?array { foreach ($session['events'] as $e) if ($e['type'] === 'pageview') return $e; return null; }
    private static function duration(array $s): float { return (float)($s['duration_s'] ?? (($s['duration_ms'] ?? 0) / 1000)); }
    private static function increment(array &$map, string $key, int|float $by = 1): void { $map[$key] = ($map[$key] ?? 0) + $by; }
    private static function money(array &$map, string $currency, string|int|float $amount): void { $map[$currency] = Decimal::add($map[$currency] ?? '0', $amount); }
    private static function distinct(array &$values, string $value): void { if (!in_array($value, $values, true)) $values[] = $value; }
    private static function segment(): array { return ['pv' => 0, 'visitors' => [], 'revenue' => '0', 'revenueByCurrency' => [], 'sessions' => 0, 'goals' => []]; }
    private static function page(): array { return ['pv' => 0, 'visitors' => [], 'visible_ms' => 0, 'entries' => 0, 'exits' => 0, 'bounces' => 0, 'completed' => 0]; }
    private static function encode(mixed $v): string { return json_encode($v, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }
    public static function emptyBucket(): array { return ['version' => 1, 'pv' => 0, 'visitors' => [], 'sessions' => 0, 'bounces' => 0, 'duration_s' => 0, 'visible_ms' => 0, 'revenue' => '0', 'revenueByCurrency' => [], 'revenueAttribution' => [], 'goalAttribution' => [], 'goals' => [], 'funnels' => [], 'segments' => [], 'pages' => [], 'sources' => [], 'audience' => [], 'events' => [], 'paths' => [], 'vitals' => [], 'activity' => []]; }
    public static function heartbeat(array $e): array
    {
        $p = $e['payload']; $hasInterval = isset($p['interval_start'], $p['interval_end']) && is_numeric($p['interval_start']) && is_numeric($p['interval_end']);
        $key = $hasInterval ? $p['interval_start'] . ':' . $p['interval_end'] : (string)($p['segment_id'] ?? $e['event_id']);
        return [$key, max(0, min($hasInterval ? max(0, (float)$p['interval_end'] - (float)$p['interval_start']) : 15000, (float)($p['visible_ms'] ?? 0)))];
    }
    public static function lastClick(array $session, array $target): array
    {
        $channel = $session['dimensions']['channel'] ?? 'direct'; $path = $session['entry_path'] ?? ''; $instance = null;
        foreach ($session['events'] as $e) { if ($e['type'] === 'pageview') { $path = $e['path']; if ($e['page_id'] === $target['page_id']) $instance = $path; $candidate = $e['dimensions']['channel'] ?? ''; if ($candidate !== '' && $candidate !== 'direct' && $candidate !== 'unknown') $channel = $candidate; } if ($e['event_id'] === $target['event_id']) break; }
        return ['channel' => $channel, 'path' => $instance ?? $path];
    }
    public static function completion(array $s, array $goal): ?array
    {
        foreach ($s['events'] as $e) {
            $matches = match ($goal['type']) { 'duration' => self::ms($e['ts']) - self::ms($s['started_at']) >= (float)($goal['config']['seconds'] ?? 0) * 1000, 'page' => $e['type'] === 'pageview' && $e['path'] === ($goal['config']['path'] ?? null), 'event' => $e['type'] === 'event' && ($e['payload']['event_name'] ?? null) === ($goal['config']['event_name'] ?? null), default => false };
            if ($matches) return $e;
        } return null;
    }
    public static function stepMatches(array $e, array $step): bool { return $step['type'] === 'page' ? $e['type'] === 'pageview' && $e['path'] === $step['value'] : $e['type'] === 'event' && ($e['payload']['event_name'] ?? null) === $step['value']; }
    public static function funnelVisitors(array $sessions, array $steps, bool $strict): array
    {
        $sets = array_fill(0, count($steps), []);
        foreach ($sessions as $s) { $at = 0; foreach ($s['events'] as $e) { if (!in_array($e['type'], ['pageview', 'event'], true)) continue; if ($at < count($steps) && self::stepMatches($e, $steps[$at])) { self::distinct($sets[$at], $s['visitor_id']); $at++; } elseif ($strict && $at > 0) break; } }
        return $sets;
    }
    /** $key can partition a bounded interval without truncating its session context. */
    public static function buckets(array $events, array $sessions, array $goals = [], array $funnels = [], ?callable $key = null): array
    {
        $key ??= fn($e) => self::hour($e); $buckets = []; $orders = []; $eventSessions = [];
        foreach ($sessions as $s) foreach ($s['events'] as $e) $eventSessions[$e['event_id']] = $s;
        $get = function(array $e) use (&$buckets, $key): string { $k = (string)$key($e); $buckets[$k] ??= self::emptyBucket(); return $k; };
        foreach (self::clean($events) as $e) {
            if ($e['type'] === 'revenue') { $order = self::encode([$e['site_id'], $e['payload']['order_id'] ?? $e['event_id']]); if (isset($orders[$order])) continue; $orders[$order] = true; }
            $k = $get($e); $b =& $buckets[$k];
            if (in_array($e['type'], ['pageview', 'revenue'], true)) { $sk = self::encode(['path' => $e['path']] + $e['dimensions']); $b['segments'][$sk] ??= self::segment(); $segment =& $b['segments'][$sk]; if ($e['type'] === 'pageview') { $segment['pv']++; self::distinct($segment['visitors'], $e['visitor_id']); } else self::money($segment['revenueByCurrency'], (string)($e['payload']['currency'] ?? 'UNKNOWN'), $e['payload']['revenue'] ?? '0'); unset($segment); }
            if ($e['type'] === 'pageview') { $b['pv']++; self::distinct($b['visitors'], $e['visitor_id']); self::distinct($b['activity'], $e['visitor_id']); $b['pages'][$e['path']] ??= self::page(); $b['pages'][$e['path']]['pv']++; self::distinct($b['pages'][$e['path']]['visitors'], $e['visitor_id']); self::increment($b['sources'], $e['dimensions']['channel'] ?? 'unknown'); foreach ($e['dimensions'] as $d => $v) { $b['audience'][$d] ??= []; self::increment($b['audience'][$d], (string)$v); } }
            if (in_array($e['type'], ['event', 'revenue'], true)) { $name = (string)($e['payload']['event_name'] ?? $e['type']); $b['events'][$name] ??= ['count' => 0, 'visitors' => [], 'properties' => []]; $r =& $b['events'][$name]; $r['count']++; self::distinct($r['visitors'], $e['visitor_id']); foreach (($e['payload']['props'] ?? []) as $property => $value) if (is_scalar($value)) { $r['properties'][$property] ??= []; self::increment($r['properties'][$property], is_bool($value) ? ($value ? 'true' : 'false') : (string)$value); } unset($r); }
            if ($e['type'] === 'revenue') { $currency = (string)($e['payload']['currency'] ?? 'UNKNOWN'); $amount = $e['payload']['revenue'] ?? '0'; self::money($b['revenueByCurrency'], $currency, $amount); $attribution = isset($eventSessions[$e['event_id']]) ? self::lastClick($eventSessions[$e['event_id']], $e) : ['channel' => $e['dimensions']['channel'] ?? 'direct', 'path' => $e['path']]; $rk = self::encode(['currency' => $currency] + $attribution); $b['revenueAttribution'][$rk] ??= ['amount' => '0', 'orders' => 0]; $b['revenueAttribution'][$rk]['amount'] = Decimal::add($b['revenueAttribution'][$rk]['amount'], $amount); $b['revenueAttribution'][$rk]['orders']++; }
            if ($e['type'] === 'vitals') foreach (($e['payload']['vitals'] ?? []) as $metric => $value) if (is_numeric($value) && is_finite((float)$value)) { $vk = self::encode([$e['path'], $metric]); $b['vitals'][$vk] ??= []; $b['vitals'][$vk][] = (float)$value; }
            unset($b);
        }
        foreach ($sessions as $s) {
            $start = self::firstPage($s); if (!$start) continue; $k = $get($start); $b =& $buckets[$k]; $b['sessions']++; $b['bounces'] += (int)$s['bounced']; $b['duration_s'] += self::duration($s); $sk = self::encode(['path' => $start['path']] + $start['dimensions']); $b['segments'][$sk] ??= self::segment(); $b['segments'][$sk]['sessions']++;
            foreach ($funnels as $f) { $steps = self::funnelVisitors([$s], $f['steps'], (bool)$f['strict']); $b['funnels'][$f['id']] ??= array_fill(0, count($f['steps']), []); foreach ($steps as $i => $visitors) foreach ($visitors as $v) self::distinct($b['funnels'][$f['id']][$i], $v); }
            if (isset($b['pages'][$s['entry_path']])) { $b['pages'][$s['entry_path']]['entries']++; $b['pages'][$s['entry_path']]['bounces'] += (int)$s['bounced']; } unset($b);
            foreach ($goals as $g) { $complete = self::completion($s, $g); if (!$complete) continue; $ck = $get($complete); $b =& $buckets[$ck]; self::increment($b['goals'], $g['id']); $b['segments'][$sk] ??= self::segment(); self::increment($b['segments'][$sk]['goals'], $g['id']); self::increment($b['goalAttribution'], self::encode(['goalId' => $g['id']] + self::lastClick($s, $complete))); unset($b); }
            $lastPage = null; foreach ($s['events'] as $e) if ($e['type'] === 'pageview') $lastPage = $e;
            if ($lastPage) { $lk = $get($lastPage); if (isset($buckets[$lk]['pages'][$lastPage['path']])) $buckets[$lk]['pages'][$lastPage['path']]['exits']++; }
            $seen = []; $completed = []; $previous = null;
            foreach ($s['events'] as $e) { $ek = $get($e); $b =& $buckets[$ek]; if ($e['type'] === 'heartbeat') { [$segment, $visible] = self::heartbeat($e); $hk = $e['page_id'] . ':' . $segment; if (!isset($seen[$hk])) { $seen[$hk] = true; $b['pages'][$e['path']] ??= self::page(); $b['pages'][$e['path']]['visible_ms'] += $visible; $b['visible_ms'] += $visible; } } if (($e['type'] === 'scroll' || ($e['payload']['event_name'] ?? null) === 'scroll') && (float)($e['payload']['props']['depth'] ?? 0) === 100.0 && !isset($completed[$e['page_id']])) { $completed[$e['page_id']] = true; $b['pages'][$e['path']] ??= self::page(); $b['pages'][$e['path']]['completed']++; } if ($e['type'] === 'pageview') { if ($previous !== null) self::increment($b['paths'], self::encode([$previous, $e['path']])); $previous = $e['path']; } unset($b); }
        }
        ksort($buckets); return $buckets;
    }
    public static function merge(array $buckets): array
    {
        $r = self::emptyBucket();
        foreach ($buckets as $b) {
            if (!isset($b['revenueByCurrency']) || !empty($b['legacyCurrencyUnsupported'])) $r['legacyCurrencyUnsupported'] = true;
            foreach (['pv', 'sessions', 'bounces', 'duration_s', 'visible_ms'] as $key) $r[$key] += $b[$key] ?? 0;
            foreach (['visitors', 'activity'] as $key) foreach (($b[$key] ?? []) as $v) self::distinct($r[$key], $v);
            foreach (($b['revenueByCurrency'] ?? []) as $c => $amount) self::money($r['revenueByCurrency'], $c, $amount);
            foreach (($b['revenueAttribution'] ?? []) as $key => $item) { $r['revenueAttribution'][$key] ??= ['amount' => '0', 'orders' => 0]; $r['revenueAttribution'][$key]['amount'] = Decimal::add($r['revenueAttribution'][$key]['amount'], $item['amount']); $r['revenueAttribution'][$key]['orders'] += $item['orders']; }
            foreach (['goalAttribution', 'goals', 'sources', 'paths'] as $key) foreach (($b[$key] ?? []) as $name => $value) self::increment($r[$key], (string)$name, $value);
            foreach (($b['audience'] ?? []) as $dimension => $values) { $r['audience'][$dimension] ??= []; foreach ($values as $name => $count) self::increment($r['audience'][$dimension], (string)$name, $count); }
            foreach (($b['segments'] ?? []) as $key => $v) { $r['segments'][$key] ??= self::segment(); $a =& $r['segments'][$key]; foreach (['pv', 'sessions'] as $n) $a[$n] += $v[$n] ?? 0; foreach (($v['visitors'] ?? []) as $visitor) self::distinct($a['visitors'], $visitor); foreach (($v['goals'] ?? []) as $id => $n) self::increment($a['goals'], $id, $n); foreach (($v['revenueByCurrency'] ?? []) as $c => $n) self::money($a['revenueByCurrency'], $c, $n); if (!isset($v['revenueByCurrency']) || !empty($v['legacyCurrencyUnsupported'])) $a['legacyCurrencyUnsupported'] = true; unset($a); }
            foreach (($b['pages'] ?? []) as $key => $v) { $r['pages'][$key] ??= self::page(); foreach (['pv', 'visible_ms', 'entries', 'exits', 'bounces', 'completed'] as $n) $r['pages'][$key][$n] += $v[$n] ?? 0; foreach (($v['visitors'] ?? []) as $visitor) self::distinct($r['pages'][$key]['visitors'], $visitor); }
            foreach (($b['events'] ?? []) as $key => $v) { $r['events'][$key] ??= ['count' => 0, 'visitors' => [], 'properties' => []]; $a =& $r['events'][$key]; $a['count'] += $v['count']; foreach ($v['visitors'] as $visitor) self::distinct($a['visitors'], $visitor); foreach ($v['properties'] as $p => $values) { $a['properties'][$p] ??= []; foreach ($values as $value => $n) self::increment($a['properties'][$p], (string)$value, $n); } unset($a); }
            foreach (($b['funnels'] ?? []) as $id => $steps) { $r['funnels'][$id] ??= array_fill(0, count($steps), []); foreach ($steps as $i => $visitors) foreach ($visitors as $v) self::distinct($r['funnels'][$id][$i], $v); }
            foreach (($b['vitals'] ?? []) as $key => $values) { $r['vitals'][$key] ??= []; array_push($r['vitals'][$key], ...$values); }
        } return $r;
    }
    private static function singleCurrency(array $values): ?string { return count($values) > 1 ? null : (array_values($values)[0] ?? '0'); }
    public static function quantile(array $values, float $q): ?float
    {
        if (!$values) return null; $weighted = []; foreach ($values as $v) $weighted[] = is_array($v) ? ['mean' => (float)$v['mean'], 'n' => (int)$v['n']] : ['mean' => (float)$v, 'n' => 1];
        usort($weighted, fn($a, $b) => $a['mean'] <=> $b['mean']); $count = array_sum(array_column($weighted, 'n')); if (!$count) return null; $rank = max(0, min(1, $q)) * ($count - 1);
        $at = function(int $index) use ($weighted): float { $n = 0; foreach ($weighted as $v) { $n += $v['n']; if ($index < $n) return $v['mean']; } return $weighted[array_key_last($weighted)]['mean']; };
        $low = (int)floor($rank); return $at($low) + ($at((int)ceil($rank)) - $at($low)) * ($rank - $low);
    }
    public static function stats(array $site, array $events, string $from, string $to, array $goals = [], array $funnels = [], array $filters = [], ?float $now = null, array $context = []): array
    {
        $now ??= microtime(true) * 1000; $start = self::ms($from); $requestedEnd = self::ms($to); if ($requestedEnd <= $start) throw new \InvalidArgumentException('invalid_range');
        $end = min($now, $requestedEnd); $cutoff = $now - (int)($site['retention_days'] ?? 365) * 86400000; $future = $start >= $now; $timezone = $site['timezone'] ?? 'UTC'; $daily = ($site['privacy_mode'] ?? 'standard') !== 'standard'; $multi = self::day($from, $timezone) !== self::day(self::iso($requestedEnd - 1), $timezone); $uv = !($daily && $multi);
        $events = array_values(array_filter(self::clean($events), fn($e) => self::ms($e['ts']) >= $cutoff && self::ms($e['ts']) < $now)); $sessions = self::sessions($events, $site);
        $key = fn($e) => self::ms($e['ts']) >= $start && self::ms($e['ts']) < $end && self::matches($e, $filters) ? self::hour($e) : 'excluded';
        $buckets = self::buckets($events, $sessions, $goals, $funnels, $key); unset($buckets['excluded']);
        $unavailable = []; $archiveCount = 0; $archives = [];
        foreach (($context['archives'] ?? []) as $row) if (isset($row['hour'], $row['data'])) $archives[$row['hour']] = $row;
        $archiveBoundary = !empty($context['archiveOnly']) ? $end : ($start < $cutoff ? min($end, $cutoff) : -INF);
        for ($hour = floor($start / 3600000) * 3600000; $hour < $archiveBoundary; $hour += 3600000) {
            $h = self::iso($hour); unset($buckets[$h]); $a = $archives[$h] ?? null;
            if (!$filters && $hour >= $start && $hour + 3600000 <= $end && $a && ($a['complete'] ?? false) && !($a['data']['unavailable'] ?? false)) { $buckets[$h] = $a['data']; $archiveCount++; }
            else $unavailable[] = $h;
        }
        if ($filters && ($start < $cutoff || !empty($context['archiveOnly']))) $unavailable[] = 'filtered_raw_history_outside_retention';
        $censored = false; foreach ($sessions as $s) { $p = self::firstPage($s); if ($p && self::ms($p['ts']) >= $start && self::ms($p['ts']) < $end && self::matches($p, $filters) && self::ms($s['started_at']) >= $cutoff && self::ms($s['started_at']) < $cutoff + self::timeout($site) && self::ms($site['created_at'] ?? self::iso($cutoff - 1)) < $cutoff) $censored = true; }
        ksort($buckets); $b = self::merge(array_values($buckets)); $truncated = (bool)($context['truncated'] ?? false); $complete = !$future && !$unavailable && !$truncated; $sessionComplete = $complete && !$censored; $definitionsComplete = $sessionComplete && !array_filter($buckets, fn($row) => !empty($row['definitionsUnavailable']));
        $revenueStatus = !empty($b['legacyCurrencyUnsupported']) ? 'unsupported_legacy_currency' : 'supported'; $leading = $b['sources']; arsort($leading); $source = array_key_first($leading);
        $retention = self::retention($site, $events, $from, $to, $now, $filters, $context);
        $totals = ['pv' => $b['pv'], 'uv' => $uv ? count($b['visitors']) : null, 'sessions' => $sessionComplete ? $b['sessions'] : null, 'bounceRate' => $sessionComplete ? ($b['sessions'] ? $b['bounces'] / $b['sessions'] : 0) : null, 'averageDuration' => $sessionComplete ? ($b['sessions'] ? $b['duration_s'] / $b['sessions'] : 0) : null, 'visibleSeconds' => $b['visible_ms'] / 1000, 'revenueCurrencyStatus' => $revenueStatus, 'revenueCurrencyCoverage' => $revenueStatus === 'supported' ? 1 : 0, 'revenue' => $revenueStatus === 'supported' ? self::singleCurrency($b['revenueByCurrency']) : null, 'revenueByCurrency' => (object)$b['revenueByCurrency'], 'conversions' => $definitionsComplete ? array_sum($b['goals']) : null];
        $result = ['storage' => ['source' => 'mysql', 'generation' => $context['generation'] ?? null, 'processedGeneration' => $context['processedGeneration'] ?? null, 'epoch' => $context['epoch'] ?? null, 'watermark' => $context['watermark'] ?? null, 'method' => $archiveCount ? 'persisted_hourly_and_retained_events' : 'retained_event_rebuild', 'rawReads' => count($events), 'archiveHours' => $archiveCount, 'truncated' => $truncated, 'coverage' => $complete ? 1 : 0], 'from' => $from, 'to' => $to, 'requestedFrom' => $from, 'requestedTo' => $to, 'effectiveFrom' => self::iso(max($start, $unavailable ? $cutoff : $start)), 'effectiveTo' => self::iso($end), 'futureClamped' => $requestedEnd > $now, 'rangeStatus' => $future ? 'future_only' : ($unavailable || $truncated ? 'partial_unavailable' : ($requestedEnd > $now ? 'future_clamped' : 'complete')), 'unavailableHours' => $unavailable, 'retentionBoundary' => self::iso($cutoff), 'precision' => 'exact', 'coverage' => $definitionsComplete ? 1 : 0, 'metricCoverage' => ['events' => $complete ? 1 : 0, 'sessions' => $sessionComplete ? 1 : 0, 'definitions' => $definitionsComplete ? 1 : 0], 'definitionMetricsStatus' => $definitionsComplete ? 'supported' : ($sessionComplete ? 'definition_history_unavailable' : 'partial_session_context'), 'sessionMetricsStatus' => $censored ? 'partial_session_context' : ($sessionComplete ? 'supported' : 'partial_unavailable'), 'watermark' => $context['watermark'] ?? ($events ? $events[array_key_last($events)]['ts'] : null), 'filters' => (object)$filters, 'filterMethod' => $filters ? 'retained_event_rebuild' : 'hourly_with_exact_boundaries', 'distinctMethod' => 'exact_set', 'uvStatus' => $uv ? 'supported' : 'unsupported_in_this_mode', 'funnelStatus' => !$uv ? 'unsupported_in_this_mode' : ($definitionsComplete ? 'supported' : ($sessionComplete ? 'definition_history_unavailable' : 'partial_session_context')), 'revenueCurrencyStatus' => $revenueStatus, 'revenueCurrencyCoverage' => $revenueStatus === 'supported' ? 1 : 0, 'totals' => $totals, 'trend' => [], 'pages' => [], 'sources' => [], 'audience' => (object)$b['audience'], 'dimensionRows' => [], 'events' => [], 'vitals' => [], 'paths' => [], 'pathLimit' => 20, 'pathsTruncated' => count($b['paths']) > 20, 'goals' => (object)($definitionsComplete ? $b['goals'] : []), 'funnels' => (object)[], 'cohorts' => $retention['cohorts'], 'retention' => $retention['retention'], 'revenueAttributionRows' => [], 'goalAttributionRows' => [], 'insight' => $source !== null ? '所选期间有 ' . $b['pv'] . ' 次页面浏览；' . $source . '渠道贡献 ' . $leading[$source] . ' 次，占比 ' . number_format($leading[$source] / max(1, $b['pv']) * 100, 1) . '%。' : '所选期间暂无页面浏览。', 'limitations' => ['收入采用十进制字符串精确累加；多个币种不合并为一个金额。', '可见时长仅累计已收到且去重的前台心跳，不估算丢失区间。', '保留期外仅使用完整、已持久化的小时聚合；缺失和非整点区间明确不可用。', '保留期边界可能截断的会话不返回完整会话指标。']];
        foreach ($buckets as $hour => $v) $result['trend'][] = ['time' => $hour, 'pv' => $v['pv'], 'uv' => !$daily || self::day(self::iso(max($start, self::ms($hour))), $timezone) === self::day(self::iso(min($end, self::ms($hour) + 3600000) - 1), $timezone) ? count($v['visitors']) : null, 'sessions' => $sessionComplete ? $v['sessions'] : null, 'revenueByCurrency' => (object)($v['revenueByCurrency'] ?? []), 'revenueAttribution' => (object)($v['revenueAttribution'] ?? [])];
        foreach ($b['pages'] as $path => $p) { unset($p['visitors']); $visitors = $b['pages'][$path]['visitors']; $result['pages'][] = ['path' => $path] + $p + ['uv' => $uv ? count($visitors) : null, 'averageDuration' => $p['pv'] ? $p['visible_ms'] / $p['pv'] / 1000 : 0, 'bounceRate' => $sessionComplete ? ($p['entries'] ? $p['bounces'] / $p['entries'] : 0) : null, 'completionRate' => $p['pv'] ? $p['completed'] / $p['pv'] : 0]; }
        foreach ($b['sources'] as $channel => $pv) $result['sources'][] = compact('channel', 'pv');
        foreach ($b['segments'] as $key => $s) $result['dimensionRows'][] = ['dimensions' => json_decode($key, true, 512, JSON_THROW_ON_ERROR), 'pv' => $s['pv'], 'uv' => $uv ? count($s['visitors']) : null, 'sessions' => $sessionComplete ? $s['sessions'] : null, 'conversions' => $definitionsComplete ? array_sum($s['goals']) : null, 'goals' => (object)($definitionsComplete ? $s['goals'] : []), 'revenue' => empty($s['legacyCurrencyUnsupported']) ? self::singleCurrency($s['revenueByCurrency']) : null, 'revenueByCurrency' => (object)$s['revenueByCurrency'], 'revenueCurrencyStatus' => empty($s['legacyCurrencyUnsupported']) ? 'supported' : 'unsupported_legacy_currency'];
        foreach ($b['events'] as $name => $e) $result['events'][] = ['name' => $name, 'count' => $e['count'], 'uv' => $uv ? count($e['visitors']) : null, 'properties' => (object)$e['properties']];
        foreach ($b['vitals'] as $key => $values) { [$path, $metric] = json_decode($key, true, 512, JSON_THROW_ON_ERROR); $approximate = count(array_filter($values, 'is_array')) > 0; $result['vitals'][] = ['path' => $path, 'metric' => $metric, 'quantileMethod' => $approximate ? 'weighted_centroid_type7' : 'exact_type7', 'quantileStatus' => $approximate ? 'approximate_tdigest_centroid_means' : 'exact', 'p75' => self::quantile($values, .75), 'p90' => self::quantile($values, .9), 'sampleCount' => array_sum(array_map(fn($v) => is_array($v) ? (int)$v['n'] : 1, $values))]; }
        arsort($b['paths']); foreach (array_slice($b['paths'], 0, 20, true) as $key => $count) { [$source, $target] = json_decode($key, true, 512, JSON_THROW_ON_ERROR); $result['paths'][] = compact('source', 'target', 'count'); }
        foreach ($b['revenueAttribution'] as $key => $v) $result['revenueAttributionRows'][] = json_decode($key, true, 512, JSON_THROW_ON_ERROR) + $v;
        if ($definitionsComplete) foreach ($b['goalAttribution'] as $key => $conversions) $result['goalAttributionRows'][] = json_decode($key, true, 512, JSON_THROW_ON_ERROR) + ['conversions' => $conversions];
        if ($uv && $definitionsComplete) { $counts = []; foreach ($b['funnels'] as $id => $steps) $counts[$id] = array_map('count', $steps); $result['funnels'] = (object)$counts; }
        usort($result['pages'], fn($a, $b) => $b['pv'] <=> $a['pv'] ?: strcmp($a['path'], $b['path'])); usort($result['sources'], fn($a, $b) => $b['pv'] <=> $a['pv']); return $result;
    }
    public static function retention(array $site, array $events, string $from, string $to, float $now, array $filters = [], array $context = []): array
    {
        $timezone = $site['timezone'] ?? 'UTC'; $start = self::ms($from); $end = min(self::ms($to), $now); $cutoff = $now - (int)($site['retention_days'] ?? 365) * 86400000;
        $metadata = ['status' => 'complete', 'coverage' => 1, 'observationFrom' => $from, 'observationTo' => self::iso($end), 'requestedTo' => $to, 'timezone' => $timezone, 'retentionBoundary' => self::iso($cutoff), 'cohortFrom' => self::day($from, $timezone), 'cohortTo' => self::day(self::iso(self::ms($to) - 1), $timezone), 'maxDay' => 30, 'method' => 'first_visit_calendar_day_exact_pageview_sets', 'denominator' => 'all_first_visitors_in_selected_local_cohort_date'];
        $unsupported = ($site['privacy_mode'] ?? 'standard') !== 'standard' ? 'unsupported_in_this_mode' : ($filters ? 'unsupported_filters' : (self::ms($to) - $start > 366 * 86400000 ? 'range_limit_exceeded' : null));
        if ($unsupported) return ['cohorts' => ['status' => $unsupported], 'retention' => array_replace($metadata, ['status' => $unsupported, 'coverage' => 0])];
        $firstSeen = []; foreach (($context['firstSeen'] ?? []) as $row) if (isset($row['visitor_id'], $row['first_date'])) $firstSeen[$row['visitor_id']] = $row['first_date'];
        $activities = []; foreach ($events as $e) if ($e['type'] === 'pageview') { $day = self::day($e['ts'], $timezone); $activities[$day][$e['visitor_id']] = true; }
        foreach (($context['archives'] ?? []) as $row) { if (!($row['complete'] ?? false)) continue; $day = self::day($row['hour'], $timezone); foreach (($row['data']['activity'] ?? []) as $v) $activities[$day][$v] = true; }
        $cohorts = []; $members = []; foreach ($firstSeen as $visitor => $day) if ($day >= $metadata['cohortFrom'] && $day <= $metadata['cohortTo']) $members[$day][$visitor] = true;
        $total = 0; $available = 0; $zone = new \DateTimeZone($timezone); $hasLedger = (bool)($context['firstSeenComplete'] ?? false);
        if (!$hasLedger) return ['cohorts' => ['status' => 'first_visit_history_unavailable'], 'retention' => array_replace($metadata, ['status' => 'first_visit_history_unavailable', 'coverage' => 0])];
        foreach ($members as $day => $visitors) { $cohorts[$day] = ['size' => count($visitors), 'days' => [], 'observations' => []]; $date = new \DateTimeImmutable($day . ' 00:00:00', $zone);
            for ($n = 1; $n <= 30; $n++) { $begin = self::ms($date->modify('+' . $n . ' days')->format(DATE_ATOM)); $finish = self::ms($date->modify('+' . ($n + 1) . ' days')->format(DATE_ATOM)); $observedDay = self::day(self::iso($begin), $timezone); $status = 'complete';
                if ($finish > $now) $status = 'not_mature'; elseif ($begin < $start || $finish > $end) $status = 'outside_observation_window'; elseif (!empty($context['truncated'])) $status = 'truncated'; elseif ($begin < $cutoff) { $hours = []; foreach (($context['archives'] ?? []) as $row) if (($row['complete'] ?? false) && !($row['data']['unavailable'] ?? false)) $hours[$row['hour']] = true; if (fmod($begin, 3600000) !== 0.0 || fmod($finish, 3600000) !== 0.0) $status = 'outside_retention'; else for ($h = $begin; $h < min($finish, $cutoff); $h += 3600000) if (!isset($hours[self::iso($h)])) { $status = 'outside_retention'; break; } }
                $returned = $status === 'complete' ? count(array_intersect_key($visitors, $activities[$observedDay] ?? [])) : null; $cohorts[$day]['days'][(string)$n] = $returned; $cohorts[$day]['observations'][(string)$n] = ['returned' => $returned, 'rate' => $returned === null ? null : $returned / count($visitors), 'status' => $status, 'coverage' => $returned === null ? 0 : 1, 'from' => self::iso($begin), 'to' => self::iso($finish)]; $total++; if ($returned !== null) $available++;
            }
        } ksort($cohorts); $metadata['coverage'] = $total ? $available / $total : 1; $metadata['status'] = $available < $total ? 'partial_unavailable' : 'complete'; return ['cohorts' => (object)$cohorts, 'retention' => $metadata];
    }
    private static function top(array $counts, int $limit = 10): array { arsort($counts); $rows = []; foreach (array_slice($counts, 0, $limit, true) as $value => $count) $rows[] = ['value' => (string)$value, 'count' => $count]; return $rows; }
    public static function dropoff(array $sessions, array $funnel, ?string $property = null): array
    {
        $sets = self::funnelVisitors($sessions, $funnel['steps'], (bool)$funnel['strict']); $features = array_fill(0, count($sets), []);
        usort($sessions, fn($a, $b) => strcmp($a['started_at'], $b['started_at']) ?: strcmp($a['id'], $b['id']));
        foreach ($sessions as $s) { $progress = self::funnelVisitors([$s], $funnel['steps'], (bool)$funnel['strict']); $cursor = 0; foreach ($funnel['steps'] as $i => $step) { if (!$progress[$i]) break; for ($j = $cursor; $j < count($s['events']); $j++) if (self::stepMatches($s['events'][$j], $step)) { $e = $s['events'][$j]; $cursor = $j + 1; $value = $property !== null ? ($e['payload']['props'][$property] ?? null) : null; $safe = is_bool($value) || is_int($value) || is_float($value) || is_string($value) && strlen($value) <= 128 && !filter_var($value, FILTER_VALIDATE_EMAIL); $features[$i][$s['visitor_id']] ??= ['source' => self::lastClick($s, $e)['channel'], 'device' => $e['dimensions']['device'] ?? $s['dimensions']['device'] ?? 'unknown', 'property' => $safe ? $value : null]; break; } } }
        $rows = []; foreach ($sets as $i => $visitors) { $lost = isset($sets[$i + 1]) ? array_diff($visitors, $sets[$i + 1]) : []; $sources = []; $devices = []; $properties = []; $samples = 0; foreach ($lost as $visitor) { $f = $features[$i][$visitor]; self::increment($sources, $f['source']); self::increment($devices, $f['device']); if ($f['property'] !== null) { self::increment($properties, self::encode([get_debug_type($f['property']), $f['property']])); $samples++; } } $row = ['step' => $i, 'definition' => $funnel['steps'][$i], 'entered' => count($visitors), 'completed' => isset($sets[$i + 1]) ? count($sets[$i + 1]) : count($visitors), 'lost' => count($lost), 'lossRate' => count($visitors) ? count($lost) / count($visitors) : 0, 'sources' => self::top($sources), 'devices' => self::top($devices), 'sampleRate' => 1]; if ($property !== null) { $row += ['property' => $property, 'propertySamples' => $samples, 'missingPropertySamples' => count($lost) - $samples, 'properties' => []]; foreach (self::top($properties) as $p) { [$type, $value] = json_decode($p['value'], true, 512, JSON_THROW_ON_ERROR); $row['properties'][] = ['type' => match($type) {'int', 'float' => 'number', 'bool' => 'boolean', default => $type}, 'value' => is_bool($value) ? ($value ? 'true' : 'false') : (string)$value, 'count' => $p['count']]; } } $rows[] = $row; } return $rows;
    }
}
