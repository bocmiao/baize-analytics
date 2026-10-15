<?php
declare(strict_types=1);
namespace Baize;

/** Standard edition analytical HTTP API. All snapshots share the deletion/intake site lock. */
final class Analytics
{
    public const EVENT_LIMIT = 100000;
    private const FILTERS = ['path', 'channel', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    private static function instant(mixed $date): float
    {
        if (!is_string($date) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/D', $date)) Http::error(400, 'invalid_range', '时间须为含时区的 ISO 日期');
        try { $value = new \DateTimeImmutable($date); $errors = \DateTimeImmutable::getLastErrors(); if ($errors && ($errors['warning_count'] || $errors['error_count'])) Http::error(400, 'invalid_range'); }
        catch (\Exception) { Http::error(400, 'invalid_range'); }
        return (float)$value->format('U.u') * 1000;
    }
    public static function range(array $query, int $maxDays = 3650): array
    {
        $to = $query['to'] ?? $query['end'] ?? Store::now(); $end = self::instant($to); $from = $query['from'] ?? $query['start'] ?? AnalysisEngine::iso($end - 7 * 86400000); $start = self::instant($from);
        if ($end <= $start || $end - $start > $maxDays * 86400000) Http::error(400, 'invalid_range', '查询范围须大于零且不超过 ' . $maxDays . ' 天');
        $filters = []; $input = is_array($query['filters'] ?? null) ? $query['filters'] + $query : $query;
        foreach (self::FILTERS as $key) if (isset($input[$key]) && $input[$key] !== '') { if (!is_string($input[$key]) || strlen($input[$key]) > ($key === 'path' ? 2048 : 500)) Http::error(400, 'invalid_filter'); $filters[$key] = $input[$key]; }
        return [$from, $to, $filters];
    }
    private static function deletedBy(array $records, array $event): bool { foreach ($records as $record) if (Governance::matches($record, $event)) return true; return false; }
    /** A larger retention setting cannot restore a previously pruned raw prefix. */
    public static function rawBoundary(App $app, string $siteId, array $site, ?float $now = null): float
    {
        $boundary = ($now ?? microtime(true) * 1000) - (int)($site['retention_days'] ?? 365) * 86400000;
        foreach (array_merge($app->store->list('privacy_tombstones', $siteId), Governance::journal($app->config)) as $record) if (($record['site_id'] ?? null) === $siteId && ($record['type'] ?? null) === 'retention' && empty($record['replay_only'])) $boundary = max($boundary, AnalysisEngine::ms($record['before']));
        return $boundary;
    }
    public static function replayBoundary(App $app, string $siteId, array $site, ?float $now = null): float
    {
        $boundary = ($now ?? microtime(true) * 1000) - min(30, (int)($site['retention_days'] ?? 365)) * 86400000;
        foreach (array_merge($app->store->list('privacy_tombstones', $siteId), Governance::journal($app->config)) as $record) if (($record['site_id'] ?? null) === $siteId && ($record['type'] ?? null) === 'retention') $boundary = max($boundary, AnalysisEngine::ms($record['before']));
        return $boundary;
    }
    /** Earliest complete raw source before this run applies its retention policy. */
    public static function rawEvidenceBoundary(App $app, string $siteId, array $site, ?float $now = null): float
    {
        $boundary = isset($site['created_at']) ? AnalysisEngine::ms($site['created_at']) : (($now ?? microtime(true) * 1000) - (int)($site['retention_days'] ?? 365) * 86400000);
        foreach (array_merge($app->store->list('privacy_tombstones', $siteId), Governance::journal($app->config)) as $record) if (($record['site_id'] ?? null) === $siteId && ($record['type'] ?? null) === 'retention' && empty($record['replay_only'])) $boundary = max($boundary, AnalysisEngine::ms($record['before']));
        return $boundary;
    }
    /** Call inside the site snapshot. Bounded reads fail visibly instead of silently sampling. */
    public static function read(App $app, string $siteId, bool $includeEvents = true): array
    {
        Governance::ensureApplied($app, $siteId);
        $site = $app->store->get('sites', $siteId); if (!$site) Http::error(404, 'site_not_found', '站点不存在');
        $site = Sessionizer::withContext($app, $siteId, $site);
        $records = array_values(array_filter(array_merge($app->store->list('privacy_tombstones', $siteId), Governance::journal($app->config)), fn($r) => $r['site_id'] === $siteId));
        $rows = $includeEvents ? $app->db->all('SELECT body FROM documents WHERE kind=? AND site_id=? ORDER BY id LIMIT ' . (self::EVENT_LIMIT + 1), ['events', $siteId]) : [];
        $truncated = count($rows) > self::EVENT_LIMIT; if ($truncated) Http::error(409, 'analysis_event_limit', '保留明细超过单次精确分析上限 100000 条；请导出明细分段分析，本次未返回截断样本');
        $events = [];
        $rawCutoff = self::rawBoundary($app, $siteId, $site); $replayCutoff = self::replayBoundary($app, $siteId, $site);
        foreach ($rows as $row) {
            $e = json_decode($row['body'], true, 512, JSON_THROW_ON_ERROR);
            if ($e['type'] === 'replay') {
                $frames = array_values(array_filter($e['payload']['replay'] ?? [], fn($frame) => isset($frame['timestamp']) && (float)$frame['timestamp'] >= $replayCutoff && !self::deletedBy($records, ['visitor_id' => $e['visitor_id'], 'ts' => $frame['timestamp'], 'type' => 'replay', 'payload' => $frame])));
                if (!$frames) continue;
                $e['payload']['replay'] = $frames; $e['ts'] = AnalysisEngine::iso(max(array_column($frames, 'timestamp')));
            } elseif (AnalysisEngine::ms($e['ts']) < $rawCutoff || self::deletedBy($records, $e)) continue;
            $events[] = $e;
        }
        $events = AnalysisEngine::clean($events); $firstSeen = $app->store->list('visitor_first_seen', $siteId); $privacy = array_values(array_filter($records, fn($r) => $r['type'] !== 'retention'));
        $firstSeen = array_values(array_filter($firstSeen, function($row) use ($privacy) { $event = ['visitor_id' => $row['visitor_id'], 'ts' => $row['first_ts'] ?? $row['first_date'] . 'T00:00:00Z', 'payload' => []]; foreach ($privacy as $record) if (Governance::matches($record, $event)) return false; return true; }));
        $state = $app->store->get('aggregation_state', $siteId) ?? [];
        return ['site' => $site, 'events' => $events, 'privacyRecords' => $records, 'context' => ['archives' => $app->store->list('stats_hourly', $siteId), 'firstSeen' => $firstSeen, 'firstSeenComplete' => ($site['first_seen_history_complete'] ?? true) === true, 'rawCutoff' => $rawCutoff, 'replayCutoff' => $replayCutoff, 'truncated' => false, 'generation' => isset($state['generation']) ? (string)$state['generation'] : null, 'processedGeneration' => isset($state['processed_generation']) ? (string)$state['processed_generation'] : null, 'epoch' => $state['epoch'] ?? null, 'watermark' => $state['watermark'] ?? ($events ? $events[array_key_last($events)]['ts'] : null)]];
    }
    private static function snapshot(App $app, string $siteId, callable $callback, bool $includeEvents = true): mixed { return $app->db->transaction(function() use ($app, $siteId, $callback, $includeEvents) { $app->db->lock('site:' . $siteId); return $callback(self::read($app, $siteId, $includeEvents)); }); }
    public static function stats(App $app, string $siteId, array $query = []): array
    {
        [$from, $to, $filters] = self::range($query);
        return self::snapshot($app, $siteId, function($read) use ($app, $siteId, $query, $from, $to, $filters) {
            $goals = $app->store->list('goals', $siteId); $funnels = $app->store->list('funnels', $siteId); $now = microtime(true) * 1000;
            $namespace = $query['namespace'] ?? null;
            if ($namespace !== null) {
                if (!is_string($namespace) || !preg_match('/^[a-f0-9-]{36}$/D', $namespace)) Http::error(400, 'invalid_history_namespace');
                $manifest = $app->store->get('history_namespaces', $namespace);
                if (!$manifest) foreach ($app->store->list('history_manifests', $siteId) as $candidate) if (($candidate['namespace'] ?? null) === $namespace) { $manifest = $candidate; break; }
                if (!$manifest || ($manifest['site_id'] ?? null) !== $siteId || ($manifest['status'] ?? null) !== 'published') Http::error(404, 'history_namespace_missing');
                $json = json_encode($manifest['tables'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
                if (!hash_equals($manifest['sha256'] ?? '', hash('sha256', $json))) Http::error(409, 'history_integrity_invalid');
                foreach (array_merge($app->store->list('privacy_tombstones', $siteId), Governance::journal($app->config)) as $record) if ($record['site_id'] === $siteId && $record['type'] !== 'retention') Http::error(409, 'history_privacy_invalidated', '存在访客删除记录，历史聚合不能逐人验证，需从已过滤明细重新捕获');
                $snapshotSite = $manifest['site_snapshot'] ?? $manifest['site'] ?? [];
                $capturedAt = $manifest['captured_at'] ?? $manifest['source_created_at'] ?? $manifest['created_at'];
                $read['site'] = $snapshotSite + $read['site']; unset($read['site']['_session_context']); $read['events'] = []; $now = min($now, AnalysisEngine::ms($capturedAt));
                $read['context'] = ['archives' => $manifest['tables']['stats_hourly'] ?? [], 'firstSeen' => $manifest['tables']['visitor_first_seen'] ?? [], 'firstSeenComplete' => ($snapshotSite['first_seen_history_complete'] ?? false) === true, 'archiveOnly' => true, 'watermark' => $capturedAt];
                $goals = $manifest['tables']['goals'] ?? []; $funnels = $manifest['tables']['funnels'] ?? [];
                if (!isset($manifest['tables']['goals'], $manifest['tables']['funnels'])) foreach ($read['context']['archives'] as &$archived) if (!empty($archived['data']['goals']) || !empty($archived['data']['funnels'])) $archived['data']['definitionsUnavailable'] = true; unset($archived);
            }
            $result = AnalysisEngine::stats($read['site'], $read['events'], $from, $to, $goals, $funnels, $filters, $now, $read['context']);
            if (($query['compare'] ?? null) === 'previous') { $previousFrom = AnalysisEngine::iso(AnalysisEngine::ms($from) - (AnalysisEngine::ms($to) - AnalysisEngine::ms($from))); $previous = AnalysisEngine::stats($read['site'], $read['events'], $previousFrom, $from, $goals, $funnels, $filters, $now, $read['context']); $changes = []; foreach ($previous['totals'] as $key => $value) $changes[$key] = is_numeric($value) && is_numeric($result['totals'][$key] ?? null) && (float)$value !== 0.0 ? ((float)$result['totals'][$key] - (float)$value) / (float)$value : null; $currentCurrencies = array_keys((array)$result['totals']['revenueByCurrency']); $previousCurrencies = array_keys((array)$previous['totals']['revenueByCurrency']); sort($currentCurrencies); sort($previousCurrencies); if ($currentCurrencies && $previousCurrencies && $currentCurrencies !== $previousCurrencies) $changes['revenue'] = null; $result['comparison'] = ['from' => $previousFrom, 'to' => $from, 'totals' => $previous['totals'], 'coverage' => $previous['coverage'], 'change' => $changes]; }
            if ($namespace !== null) { $result['storage']['source'] = 'mysql_history_namespace'; $result['storage']['namespace'] = $namespace; $result['storage']['method'] = 'isolated_persisted_hourly_snapshot'; $result['historyNamespace'] = $namespace; $result['definitions'] = ['goals' => $goals, 'funnels' => $funnels]; }
            return $result;
        }, !isset($query['namespace']));
    }
    private static function detailed(array $read, string $from, string $to): array
    {
        $now = microtime(true) * 1000; $cutoff = max($now - (int)($read['site']['retention_days'] ?? 365) * 86400000, (float)($read['context']['rawCutoff'] ?? -INF)); $end = min($now, AnalysisEngine::ms($to));
        $status = AnalysisEngine::ms($from) >= $now ? 'future_only' : (AnalysisEngine::ms($from) < $cutoff ? 'outside_raw_retention' : 'supported');
        return ['from' => $from, 'to' => $to, 'effectiveTo' => AnalysisEngine::iso($end), 'watermark' => $read['context']['watermark'], 'status' => $status, 'coverage' => $status === 'supported' ? 1 : 0, 'sampleRate' => 1, 'truncated' => false, 'storage' => ['source' => 'mysql', 'method' => 'retained_event_rebuild', 'generation' => $read['context']['generation'] ?? null, 'processedGeneration' => $read['context']['processedGeneration'] ?? null, 'epoch' => $read['context']['epoch'] ?? null, 'watermark' => $read['context']['watermark'], 'coverage' => $status === 'supported' ? 1 : 0, 'truncated' => false]];
    }
    private static function selected(array $read, string $from, string $to, array $filters = []): array { $start = AnalysisEngine::ms($from); $end = min(microtime(true) * 1000, AnalysisEngine::ms($to)); return array_values(array_filter($read['events'], fn($e) => AnalysisEngine::ms($e['ts']) >= $start && AnalysisEngine::ms($e['ts']) < $end && AnalysisEngine::matches($e, $filters))); }
    private static function uvSupported(array $site, string $from, string $to): bool { return ($site['privacy_mode'] ?? 'standard') === 'standard' || AnalysisEngine::day($from, $site['timezone'] ?? 'UTC') === AnalysisEngine::day(AnalysisEngine::iso(AnalysisEngine::ms($to) - 1), $site['timezone'] ?? 'UTC'); }
    private static function rows(array $groups, string $metric = 'count', int $limit = 100000): array { $rows = array_values($groups); usort($rows, fn($a, $b) => $b[$metric] <=> $a[$metric]); return array_slice($rows, 0, $limit); }
    /** Bounded semantic aggregates shared by MCP and AI tools; no raw fields escape this method. */
    public static function semantic(App $app, string $siteId, array $query): array
    {
        if (array_diff(array_keys($query), ['metric', 'dimension', 'filters', 'start', 'end', 'limit'])) Http::error(400, 'semantic_query_invalid');
        foreach (['start', 'end'] as $field) {
            $value = $query[$field] ?? null;
            if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)) Http::error(400, 'aggregate_range_invalid');
            $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $value, new \DateTimeZone('UTC'));
            if (!$date || $date->format('Y-m-d') !== $value) Http::error(400, 'aggregate_range_invalid');
        }
        $startDate = $query['start']; $endDate = $query['end'];
        if ($startDate > $endDate || (new \DateTimeImmutable($startDate))->diff(new \DateTimeImmutable($endDate))->days > 30) Http::error(400, 'aggregate_range_invalid');
        $metric = $query['metric'] ?? null; $dimension = $query['dimension'] ?? 'day'; $limit = $query['limit'] ?? 30; $filters = $query['filters'] ?? [];
        if (!in_array($metric, ['pv', 'uv', 'sessions', 'conversions', 'conversion_rate'], true) || !in_array($dimension, ['day', 'page', 'source', 'device'], true) || (!is_int($limit) && !(is_float($limit) && is_finite($limit) && floor($limit) === $limit)) || $limit < 1 || $limit > 100 || !is_array($filters) || $filters && array_is_list($filters) || array_diff(array_keys($filters), ['source', 'device', 'os', 'page'])) Http::error(400, 'semantic_query_invalid');
        $limit = (int)$limit;
        foreach ($filters as $key => $value) if (!is_string($value) || mb_strlen($value, 'UTF-8') > ['source' => 200, 'device' => 100, 'os' => 100, 'page' => 500][$key]) Http::error(400, 'semantic_query_invalid');
        return self::snapshot($app, $siteId, function(array $read) use ($app, $siteId, $startDate, $endDate, $metric, $dimension, $limit, $filters): array {
            $site = $read['site']; $timezone = $site['timezone'] ?? 'UTC'; $zone = new \DateTimeZone($timezone); $now = microtime(true) * 1000;
            $from = AnalysisEngine::ms((new \DateTimeImmutable($startDate . ' 00:00:00', $zone))->format(DATE_ATOM));
            $requestedEnd = AnalysisEngine::ms((new \DateTimeImmutable($endDate . ' 00:00:00', $zone))->modify('+1 day')->format(DATE_ATOM)); $to = min($now, $requestedEnd);
            $unsupported = static fn(string $reason): array => ['status' => 'unsupported', 'reason' => $reason];
            if ($endDate > AnalysisEngine::day(AnalysisEngine::iso($now), $timezone)) return $unsupported('future-calendar-range');
            $cutoff = $read['context']['rawCutoff'];
            if ($from < $cutoff) return $unsupported('raw-history-outside-retention');
            if ($metric === 'uv' && ($site['privacy_mode'] ?? 'standard') !== 'standard' && $startDate !== $endDate) return $unsupported('daily-salt-cross-day-uv');
            $matches = static function(array $event) use ($filters): bool {
                foreach ($filters as $key => $value) if (($key === 'page' ? $event['path'] : ($event['dimensions'][$key === 'source' ? 'channel' : $key] ?? 'unknown')) !== $value) return false;
                return true;
            };
            $label = static fn(array $event): string => match ($dimension) { 'day' => AnalysisEngine::day($event['ts'], $timezone), 'page' => $event['path'], 'source' => $event['dimensions']['channel'] ?? 'unknown', default => $event['dimensions']['device'] ?? 'unknown' };
            $selected = static fn(array $event): bool => AnalysisEngine::ms($event['ts']) >= $from && AnalysisEngine::ms($event['ts']) < $to;
            $groups = []; $ensure = static function(string $key) use (&$groups): void { $groups[$key] ??= ['count' => 0, 'visitors' => [], 'numerator' => 0, 'denominator' => 0]; };
            if ($metric === 'pv' || $metric === 'uv') {
                foreach ($read['events'] as $event) if ($event['type'] === 'pageview' && $selected($event) && $matches($event)) { $key = $label($event); $ensure($key); $groups[$key]['count']++; $groups[$key]['visitors'][$event['visitor_id']] = true; }
            } else {
                $goals = $app->store->list('goals', $siteId);
                foreach (AnalysisEngine::sessions($read['events'], $site) as $session) {
                    $first = null; foreach ($session['events'] as $event) if ($event['type'] === 'pageview') { $first = $event; break; }
                    if (!$first || !$matches($first)) continue;
                    $cohort = $selected($first); $sessionStart = AnalysisEngine::ms($session['started_at']);
                    $intersects = AnalysisEngine::ms($session['last_active']) >= $from && AnalysisEngine::ms($first['ts']) < $to;
                    if ($sessionStart >= $cutoff && $sessionStart < $cutoff + AnalysisEngine::timeout($site) && AnalysisEngine::ms($site['created_at'] ?? AnalysisEngine::iso($cutoff - 1)) < $cutoff && ($metric === 'sessions' ? $cohort : $intersects)) return $unsupported('partial-session-context');
                    $key = $label($first);
                    if ($metric === 'sessions' && $cohort) { $ensure($key); $groups[$key]['count']++; continue; }
                    if ($metric === 'sessions') continue;
                    $converted = false;
                    foreach ($goals as $goal) {
                        $completion = AnalysisEngine::completion($session, $goal); if (!$completion || !$selected($completion)) continue;
                        $converted = true;
                        if ($metric === 'conversions') { $completionKey = $dimension === 'day' ? $label($completion) : $key; $ensure($completionKey); $groups[$completionKey]['count']++; }
                    }
                    if ($metric === 'conversion_rate' && $cohort) { $ensure($key); $groups[$key]['denominator']++; if ($converted) $groups[$key]['numerator']++; }
                }
            }
            if ($dimension === 'day') for ($date = new \DateTimeImmutable($startDate, new \DateTimeZone('UTC')); $date->format('Y-m-d') <= $endDate; $date = $date->modify('+1 day')) $ensure($date->format('Y-m-d'));
            $points = [];
            foreach ($groups as $key => $row) {
                $value = match ($metric) { 'uv' => count($row['visitors']), 'conversion_rate' => $row['denominator'] ? $row['numerator'] / $row['denominator'] : null, default => $row['count'] };
                $point = ['label' => (string)$key, 'value' => $value]; if ($metric === 'conversion_rate') $point += ['numerator' => $row['numerator'], 'denominator' => $row['denominator']]; $points[] = $point;
            }
            usort($points, static fn(array $a, array $b): int => $dimension === 'day' ? strcmp($a['label'], $b['label']) : (($b['value'] ?? -1) <=> ($a['value'] ?? -1) ?: strcmp($a['label'], $b['label'])));
            $total = count($points); $series = ['metric' => $metric, 'dimension' => $dimension, 'unit' => $metric === 'conversion_rate' ? 'ratio' : 'count', 'points' => array_slice($points, 0, $limit), 'truncated' => $total > $limit, 'totalGroups' => $total, 'timezone' => $timezone, 'precision' => 'site-calendar-day'];
            if ($metric === 'conversion_rate') $series['conversionSemantics'] = 'distinct_any_goal_completed_sessions_in_start_cohort_and_completion_window';
            $state = $app->store->get('aggregation_state', $siteId) ?? [];
            return ['status' => 'ok', 'series' => $series, 'storage' => ['source' => 'mysql', 'generation' => (string)($state['generation'] ?? $state['processed_events'] ?? count($read['events'])), 'epoch' => External::epoch($app, $siteId), 'watermark' => $read['context']['watermark'], 'coverage' => 1]];
        });
    }
    public static function content(App $app, string $siteId, array $query): array
    {
        [$from, $to, $filters] = self::range($query, 90);
        return self::snapshot($app, $siteId, function($read) use ($app, $siteId, $from, $to, $filters) {
            $base = self::detailed($read, $from, $to) + ['filters' => (object)$filters, 'filterMethod' => 'retained_event_rebuild', 'downloads' => [], 'notFound' => [], 'eventTrend' => [], 'goalTrends' => (object)[], 'dropoffFeatures' => (object)[], 'limitations' => ['下载仅表示追踪到点击，不证明文件传输完成。', '仅从真实 404 状态事件计算修复清单。']]; if ($base['coverage'] !== 1) return $base;
            $uv = self::uvSupported($read['site'], $from, $to); $downloads = []; $notFound = []; $trends = [];
            foreach (self::selected($read, $from, $to, $filters) as $e) { $p = $e['payload']['props'] ?? []; if ($e['type'] === 'pageview' && (int)($p['status'] ?? 0) === 404) { $r = ['path' => $e['path'], 'channel' => $e['dimensions']['channel'] ?? 'unknown', 'referrer' => $e['payload']['referrer'] ?? $e['dimensions']['referrer'] ?? '', 'count' => 0]; $k = json_encode($r, JSON_THROW_ON_ERROR); $notFound[$k] ??= $r; $notFound[$k]['count']++; } if (!in_array($e['type'], ['event', 'revenue'], true)) continue; $name = (string)($e['payload']['event_name'] ?? $e['type']); $h = AnalysisEngine::hour($e); $trends[$h][$name] ??= ['count' => 0, 'visitors' => []]; $trends[$h][$name]['count']++; $trends[$h][$name]['visitors'][$e['visitor_id']] = true; if ($name === 'download' && is_string($p['url'] ?? null)) { $path = parse_url($p['url'], PHP_URL_PATH) ?: ''; preg_match('/\.([a-z0-9]{1,16})$/iD', $path, $ext); $r = ['url' => $p['url'], 'fileType' => strtolower($ext[1] ?? 'unknown'), 'path' => $e['path'], 'count' => 0, 'visitors' => []]; $k = json_encode([$r['url'], $r['fileType'], $r['path']], JSON_THROW_ON_ERROR); $downloads[$k] ??= $r; $downloads[$k]['count']++; $downloads[$k]['visitors'][$e['visitor_id']] = true; } }
            foreach ($downloads as &$row) { $row['uv'] = $uv ? count($row['visitors']) : null; unset($row['visitors']); } unset($row); $base['downloads'] = self::rows($downloads); $base['notFound'] = self::rows($notFound); ksort($trends); foreach ($trends as $time => $names) { $values = []; foreach ($names as $name => $r) $values[$name] = ['count' => $r['count'], 'uv' => $uv ? count($r['visitors']) : null]; $base['eventTrend'][] = ['time' => $time, 'events' => (object)$values]; }
            $sessions = AnalysisEngine::sessions($read['events'], $read['site']); $sessions = array_values(array_filter($sessions, function($s) use ($filters) { foreach ($s['events'] as $e) if ($e['type'] === 'pageview') return AnalysisEngine::matches($e, $filters); return false; })); $goals = [];
            $frontier = $read['context']['rawCutoff'];
            foreach ($sessions as $session) if (AnalysisEngine::ms($session['started_at']) >= $frontier && AnalysisEngine::ms($session['started_at']) < $frontier + AnalysisEngine::timeout($read['site']) && AnalysisEngine::ms($read['site']['created_at'] ?? AnalysisEngine::iso($frontier - 1)) < $frontier) { $base['coverage'] = 0; $base['definitionStatus'] = 'partial_session_context'; $base['funnelStatus'] = 'partial_session_context'; return $base; }
            foreach ($app->store->list('goals', $siteId) as $g) { $hours = []; foreach ($sessions as $s) { $e = AnalysisEngine::completion($s, $g); if (!$e || AnalysisEngine::ms($e['ts']) < AnalysisEngine::ms($from) || AnalysisEngine::ms($e['ts']) >= AnalysisEngine::ms($to)) continue; $h = AnalysisEngine::hour($e); $c = AnalysisEngine::lastClick($s, $e)['channel']; $hours[$h][$c] = ($hours[$h][$c] ?? 0) + 1; } ksort($hours); $goals[$g['id']] = []; foreach ($hours as $time => $channels) { $rows = []; foreach ($channels as $channel => $conversions) $rows[] = compact('channel', 'conversions'); $goals[$g['id']][] = ['time' => $time, 'conversions' => array_sum($channels), 'channels' => $rows]; } } $base['goalTrends'] = (object)$goals;
            $features = []; if ($uv) foreach ($app->store->list('funnels', $siteId) as $f) { $cohort = array_values(array_filter($sessions, fn($s) => AnalysisEngine::ms($s['started_at']) >= AnalysisEngine::ms($from) && AnalysisEngine::ms($s['started_at']) < AnalysisEngine::ms($to))); $features[$f['id']] = AnalysisEngine::dropoff($cohort, $f); } $base['dropoffFeatures'] = (object)$features; $base['funnelStatus'] = $uv ? 'supported' : 'unsupported_in_this_mode'; return $base;
        });
    }
    public static function register(App $app, Router $router): void
    {
        $base = '/api/v1/sites/:siteId'; $authorized = function(Http $r, string $permission = 'read') use ($app): string { $site = $r->params['siteId']; $app->auth->authorize($r, $site, $permission); return $site; };
        $router->add('GET', $base . '/stats', fn(Http $r) => self::stats($app, $authorized($r), $r->query));
        $router->add('GET', $base . '/pages/detail', function(Http $r) use ($app, $authorized) { if (!is_string($r->query['path'] ?? null) || !str_starts_with($r->query['path'], '/')) Http::error(400, 'path_required'); $stats = self::stats($app, $authorized($r), $r->query); return ['path' => $r->query['path']] + array_intersect_key($stats, array_flip(['from', 'to', 'trend', 'sources', 'audience', 'totals', 'watermark', 'coverage', 'rangeStatus', 'unavailableHours', 'filterMethod', 'storage'])); });
        foreach (['content', 'analysis/features'] as $path) $router->add('GET', $base . '/' . $path, fn(Http $r) => self::content($app, $authorized($r), $r->query));
        $router->add('GET', $base . '/content/404.csv', function(Http $r) use ($app, $authorized) { $site = $authorized($r); $data = self::content($app, $site, $r->query); if ($data['status'] !== 'supported') Http::error(409, 'content_unavailable', '所选期间没有完整保留的 404 明细'); $stream = fopen('php://temp', 'w+'); fwrite($stream, "\xEF\xBB\xBF"); $rows = [['失效路径', '来源渠道', '来源页面', '次数', '修复目标']]; foreach ($data['notFound'] as $row) $rows[] = [$row['path'], $row['channel'], $row['referrer'], $row['count'], '']; foreach ($rows as $row) fputcsv($stream, array_map(fn($s) => preg_match('/^(?:\s*[=+@-]|[\t\r\n])/', (string)$s) ? "'" . $s : (string)$s, $row), ',', '"', '', "\r\n"); rewind($stream); $app->audit($app->auth->user($r)['id'], $site, '404.repair_export', ['rows' => count($data['notFound'])]); header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="404-repair.csv"'); echo stream_get_contents($stream); fclose($stream); return null; });
        foreach (['goals', 'funnels'] as $kind) {
            $router->add('GET', $base . '/' . $kind, function(Http $r) use ($app, $authorized, $kind) { return $app->store->list($kind, $authorized($r)); });
            foreach (['POST', 'PUT'] as $method) $router->add($method, $base . '/' . $kind . ($method === 'PUT' ? '/:id' : ''), function(Http $r) use ($app, $authorized, $kind, $method) { $site = $authorized($r, 'write'); $body = self::definition($kind, $r->body); $id = $method === 'POST' ? Store::uuid() : $r->params['id']; $app->db->transaction(function() use ($app, $site, $kind, $method, $body, $id, $r) { $app->db->lock('site:' . $site); if ($method === 'PUT') self::owned($app, $kind, $id, $site); $app->store->put($kind, $id, ['id' => $id, 'site_id' => $site] + $body, $site); self::invalidate($app, $site); $app->audit($app->auth->user($r)['id'], $site, $kind . ($method === 'POST' ? '.create' : '.update'), ['id' => $id]); }); return $method === 'POST' ? ['id' => $id] : ['updated' => true]; });
            $router->add('DELETE', $base . '/' . $kind . '/:id', function(Http $r) use ($app, $authorized, $kind) { $site = $authorized($r, 'write'); $app->db->transaction(function() use ($app, $site, $r, $kind) { $app->db->lock('site:' . $site); self::owned($app, $kind, $r->params['id'], $site); $app->store->delete($kind, $r->params['id']); self::invalidate($app, $site); $app->audit($app->auth->user($r)['id'], $site, $kind . '.delete', ['id' => $r->params['id']]); }); return ['deleted' => true]; });
        }
        $router->add('GET', $base . '/analysis', function(Http $r) use ($app, $authorized) { $site = $authorized($r); $s = self::stats($app, $site, $r->query); $goals = []; foreach (($s['definitions']['goals'] ?? $app->store->list('goals', $site)) as $g) { $n = ((array)$s['goals'])[$g['id']] ?? 0; $goals[] = ['id' => $g['id'], 'name' => $g['name'], 'conversions' => $s['metricCoverage']['definitions'] === 1 ? $n : null, 'attribution' => array_values(array_filter($s['goalAttributionRows'], fn($a) => $a['goalId'] === $g['id'])), 'rate' => $s['metricCoverage']['definitions'] === 1 && $s['totals']['sessions'] ? $n / $s['totals']['sessions'] : null]; } $funnels = []; foreach (($s['definitions']['funnels'] ?? $app->store->list('funnels', $site)) as $f) { $counts = ((array)$s['funnels'])[$f['id']] ?? []; $dropoff = []; foreach ($counts as $i => $n) $dropoff[] = $i ? $counts[$i - 1] - $n : 0; $funnels[] = ['id' => $f['id'], 'name' => $f['name'], 'steps' => $counts, 'dropoff' => $dropoff, 'rate' => ($counts[0] ?? 0) ? end($counts) / $counts[0] : null]; } return ['from' => $s['effectiveFrom'], 'to' => $s['effectiveTo'], 'coverage' => $s['coverage'], 'watermark' => $s['watermark'], 'funnelStatus' => $s['funnelStatus'], 'goals' => $goals, 'funnels' => $funnels]; });
        $router->add('GET', $base . '/funnels/:funnelId/analysis', function(Http $r) use ($app, $authorized) { $site = $authorized($r); [$from, $to, $filters] = self::range($r->query, 90); if (AnalysisEngine::ms($to) > microtime(true) * 1000) Http::error(400, 'future_range'); $property = $r->query['property'] ?? null; if ($property !== null && (!is_string($property) || strlen($property) > 64 || EventPrivacy::stableKey($property))) Http::error(400, 'invalid_property'); return self::snapshot($app, $site, function($read) use ($app, $site, $r, $from, $to, $filters, $property) { $f = self::owned($app, 'funnels', $r->params['funnelId'], $site); $base = self::detailed($read, $from, $to) + ['funnelId' => $f['id'], 'strict' => $f['strict'], 'eventLimit' => self::EVENT_LIMIT, 'dimensionLimit' => 10, 'steps' => []]; if (!self::uvSupported($read['site'], $from, $to)) return array_replace($base, ['status' => 'unsupported_in_this_mode', 'coverage' => 0]); if ($filters) return array_replace($base, ['status' => 'unsupported_filters', 'coverage' => 0]); if ($base['coverage'] !== 1) return $base; $sessions = AnalysisEngine::sessions($read['events'], $read['site']); $cohort = array_values(array_filter($sessions, fn($s) => AnalysisEngine::ms($s['started_at']) >= AnalysisEngine::ms($from) && AnalysisEngine::ms($s['started_at']) < AnalysisEngine::ms($to))); $frontier = $read['context']['rawCutoff']; foreach ($cohort as $s) if (AnalysisEngine::ms($s['started_at']) >= $frontier && AnalysisEngine::ms($s['started_at']) < $frontier + AnalysisEngine::timeout($read['site']) && AnalysisEngine::ms($read['site']['created_at'] ?? AnalysisEngine::iso($frontier - 1)) < $frontier) return array_replace($base, ['status' => 'partial_session_context', 'coverage' => 0]); return array_replace($base, ['steps' => AnalysisEngine::dropoff($cohort, $f, $property), 'contextFrom' => AnalysisEngine::iso($frontier), 'contextTo' => Store::now(), 'observedEvents' => count($read['events'])]); }); });
        $router->add('GET', $base . '/event-properties', function(Http $r) use ($app, $authorized) { $site = $authorized($r); [$from, $to] = self::range($r->query, 90); $name = $r->query['event_name'] ?? ''; $property = $r->query['property'] ?? ''; if (!is_string($name) || $name === '' || strlen($name) > 128 || !is_string($property) || $property === '' || strlen($property) > 64 || EventPrivacy::stableKey($property)) Http::error(400, 'invalid_property'); return self::snapshot($app, $site, function($read) use ($name, $property, $from, $to) { $base = self::detailed($read, $from, $to) + ['event_name' => $name, 'property' => $property, 'groups' => [], 'typedGroups' => []]; if ($base['coverage'] !== 1) return $base; $groups = []; $uv = self::uvSupported($read['site'], $from, $to); foreach (self::selected($read, $from, $to) as $e) { $v = $e['payload']['props'][$property] ?? null; if (($e['payload']['event_name'] ?? null) !== $name || !is_scalar($v)) continue; $type = match(get_debug_type($v)) {'int', 'float' => 'number', 'bool' => 'boolean', default => 'string'}; $k = json_encode([$type, $v], JSON_THROW_ON_ERROR); $groups[$k] ??= ['value' => $v, 'type' => $type, 'count' => 0, 'visitorSet' => []]; $groups[$k]['count']++; $groups[$k]['visitorSet'][$e['visitor_id']] = true; } $base['groupLimit'] = 100; $base['groupsTruncated'] = count($groups) > 100; foreach (self::rows($groups, 'count', 100) as $row) { $row['visitors'] = $uv ? count($row['visitorSet']) : null; unset($row['visitorSet']); $base['typedGroups'][] = $row; $base['groups'][] = ['value' => is_bool($row['value']) ? ($row['value'] ? 'true' : 'false') : (string)$row['value'], 'count' => $row['count'], 'visitors' => $row['visitors']]; } return $base; }); });
        self::registerGeography($app, $router, $base, $authorized); self::registerRevenueIdentity($app, $router, $base, $authorized); self::registerExperience($app, $router, $base, $authorized); self::registerRealtime($app, $router, $base, $authorized); self::registerExperiments($app, $router, $base, $authorized);
    }
    private static function definition(string $kind, array $b): array
    {
        if (!is_string($b['name'] ?? null) || trim($b['name']) === '' || mb_strlen($b['name']) > 100) Http::error(400, 'invalid_definition');
        if ($kind === 'goals') { if (!in_array($b['type'] ?? '', ['page', 'event', 'duration'], true) || !is_array($b['config'] ?? null)) Http::error(400, 'invalid_goal'); $c = $b['config']; if ($b['type'] === 'page' && (!is_string($c['path'] ?? null) || !str_starts_with($c['path'], '/') || strlen($c['path']) > 2048) || $b['type'] === 'event' && (!is_string($c['event_name'] ?? null) || $c['event_name'] === '' || strlen($c['event_name']) > 128) || $b['type'] === 'duration' && (!is_numeric($c['seconds'] ?? null) || $c['seconds'] <= 0 || $c['seconds'] > 86400)) Http::error(400, 'invalid_goal'); return ['name' => trim($b['name']), 'type' => $b['type'], 'config' => $c]; }
        if (!is_array($b['steps'] ?? null) || count($b['steps']) < 2 || count($b['steps']) > 20 || isset($b['strict']) && !is_bool($b['strict'])) Http::error(400, 'invalid_funnel'); foreach ($b['steps'] as $s) if (!is_array($s) || !in_array($s['type'] ?? '', ['page', 'event'], true) || !is_string($s['value'] ?? null) || $s['value'] === '' || strlen($s['value']) > 2048) Http::error(400, 'invalid_funnel'); return ['name' => trim($b['name']), 'steps' => $b['steps'], 'strict' => $b['strict'] ?? false];
    }
    private static function owned(App $app, string $kind, string $id, string $site): array { $row = $app->store->get($kind, $id); if (!$row || ($row['site_id'] ?? null) !== $site) Http::error(404, 'definition_not_found'); return $row; }
    private static function invalidate(App $app, string $site): void
    {
        $state = $app->store->get('aggregation_state', $site) ?? ['site_id' => $site, 'generation' => 0]; $state['generation'] = (int)($state['generation'] ?? 0) + 1; $state['definitions_changed_at'] = Store::now(); $app->store->put('aggregation_state', $site, $state, $site);
        foreach (['ai_suggestions', 'analytics_definitions'] as $kind) foreach ($app->store->list($kind, $site) as $row) if (isset($row['id'])) $app->store->delete($kind, $row['id']);
        // Archived goals and funnels reflect earlier definitions. Keep event/revenue evidence but invalidate those metrics.
        foreach ($app->store->list('stats_hourly', $site) as $row) { $row['data']['definitionsUnavailable'] = true; $app->store->put('stats_hourly', $row['id'] ?? $site . ':' . $row['hour'], $row, $site); }
    }
    private static function registerGeography(App $app, Router $router, string $base, callable $authorized): void
    {
        $router->add('GET', $base . '/geography', function(Http $r) use ($app, $authorized) { $site = $authorized($r); [$from, $to, $filters] = self::range($r->query, 90); return self::snapshot($app, $site, function($read) use ($r, $from, $to, $filters) { $base = self::detailed($read, $from, $to) + ['countries' => [], 'regions' => [], 'cities' => [], 'geographyCoverage' => 0, 'filters' => (object)$filters, 'filterMethod' => 'retained_event_rebuild']; if ($base['coverage'] !== 1) return $base; $countries = []; $regions = []; $cities = []; $known = 0; $total = 0; $uv = self::uvSupported($read['site'], $from, $to); foreach (self::selected($read, $from, $to, $filters) as $e) { if ($e['type'] !== 'pageview') continue; $country = $e['dimensions']['country'] ?? 'unknown'; $region = self::normalizeRegion($country, $e['dimensions']['region'] ?? 'unknown'); $city = $e['dimensions']['city'] ?? 'unknown'; $total++; if ($country !== 'unknown' && $region !== 'unknown') $known++; $countries[$country] ??= ['country' => $country, 'pv' => 0, 'visitors' => []]; $countries[$country]['pv']++; $countries[$country]['visitors'][$e['visitor_id']] = true; if (!empty($r->query['country']) && $r->query['country'] !== $country) continue; $k = json_encode([$country, $region], JSON_THROW_ON_ERROR); $regions[$k] ??= ['country' => $country, 'region' => $region, 'pv' => 0, 'visitors' => []]; $regions[$k]['pv']++; $regions[$k]['visitors'][$e['visitor_id']] = true; if (!empty($r->query['region']) && self::normalizeRegion($country, $r->query['region']) !== $region) continue; $k = json_encode([$country, $region, $city], JSON_THROW_ON_ERROR); $cities[$k] ??= ['country' => $country, 'region' => $region, 'city' => $city, 'pv' => 0, 'visitors' => []]; $cities[$k]['pv']++; $cities[$k]['visitors'][$e['visitor_id']] = true; } foreach (['countries' => $countries, 'regions' => $regions, 'cities' => $cities] as $key => $values) { foreach ($values as &$v) { $v['uv'] = $uv ? count($v['visitors']) : null; unset($v['visitors']); } unset($v); $base[$key] = self::rows($values, 'pv'); } $base['pv'] = $total; $base['geographyCoverage'] = $total ? $known / $total : 0; $base['uvStatus'] = $uv ? 'supported' : 'unsupported_in_this_mode'; $base['distinctMethod'] = 'exact_set'; return $base; }); });
    }
    public static function normalizeRegion(string $country, string $region): string
    {
        if (!in_array($country, ['CN', 'HK', 'MO', 'TW'], true)) return $region ?: 'unknown';
        $names = ['Beijing' => '北京', 'Tianjin' => '天津', 'Hebei' => '河北', 'Shanxi' => '山西', 'Inner Mongolia' => '内蒙古', 'Liaoning' => '辽宁', 'Jilin' => '吉林', 'Heilongjiang' => '黑龙江', 'Shanghai' => '上海', 'Jiangsu' => '江苏', 'Zhejiang' => '浙江', 'Anhui' => '安徽', 'Fujian' => '福建', 'Jiangxi' => '江西', 'Shandong' => '山东', 'Henan' => '河南', 'Hubei' => '湖北', 'Hunan' => '湖南', 'Guangdong' => '广东', 'Guangxi' => '广西', 'Hainan' => '海南', 'Chongqing' => '重庆', 'Sichuan' => '四川', 'Guizhou' => '贵州', 'Yunnan' => '云南', 'Tibet' => '西藏', 'Shaanxi' => '陕西', 'Gansu' => '甘肃', 'Qinghai' => '青海', 'Ningxia' => '宁夏', 'Xinjiang' => '新疆', 'Hong Kong' => '香港', 'Macao' => '澳门', 'Macau' => '澳门', 'Taiwan' => '台湾']; foreach ($names as $english => $chinese) if (strcasecmp(trim($region), $english) === 0 || preg_replace('/(?:壮族|回族|维吾尔)?自治区$|特别行政区$|省$|市$/u', '', $region) === $chinese) return $chinese; return $region ?: 'unknown';
    }
    private static function identityEvents(App $app, array $read, string $site): array
    {
        $bindings = $app->store->list('identity_bindings', $site); $result = []; foreach ($read['events'] as $event) { $at = AnalysisEngine::ms($event['ts']); $binding = null; foreach ($bindings as $b) if ($b['visitor_id'] === $event['visitor_id'] && AnalysisEngine::ms($b['started_at']) <= $at && (!isset($b['ended_at']) || AnalysisEngine::ms($b['ended_at']) > $at) && (!$binding || AnalysisEngine::ms($b['started_at']) > AnalysisEngine::ms($binding['started_at']))) $binding = $b; if (!$binding) continue; $event['user_hash'] = $binding['user_id']; $event['binding_start'] = $binding['started_at']; $event['visitor_id_original'] = $event['visitor_id']; $event['visitor_id'] = json_encode([$event['visitor_id'], $binding['started_at']], JSON_THROW_ON_ERROR); $result[] = $event; } return $result;
    }
    private static function registerRevenueIdentity(App $app, Router $router, string $base, callable $authorized): void
    {
        $router->add('GET', $base . '/revenue', function(Http $r) use ($app, $authorized) { self::range($r->query, 90); $stats = self::stats($app, $authorized($r), $r->query); $trend = []; foreach ($stats['trend'] as $row) foreach ((array)$row['revenueByCurrency'] as $currency => $amount) { $orders = ((array)($row['orderCountsByCurrency'] ?? []))[$currency] ?? 0; $trend[] = ['time' => $row['time'], 'currency' => $currency, 'amount' => $amount, 'orders' => $orders]; } return array_intersect_key($stats, array_flip(['from', 'to', 'requestedFrom', 'requestedTo', 'effectiveFrom', 'effectiveTo', 'rangeStatus', 'futureClamped', 'filters', 'filterMethod', 'coverage', 'watermark', 'storage', 'limitations'])) + ['status' => $stats['revenueCurrencyStatus'], 'attributionStatus' => $stats['revenueAttributionStatus'], 'revenueByCurrency' => $stats['totals']['revenueByCurrency'], 'trend' => $trend, 'attribution' => $stats['revenueAttributionRows']]; });
        foreach (['identities', 'identities/:userKey/activity', 'users/:userId/paths'] as $route) $router->add('GET', $base . '/' . $route, function(Http $r) use ($app, $authorized, $route) { $site = $authorized($r); [$from, $to, $filters] = self::range($r->query, 90); return self::snapshot($app, $site, function($read) use ($app, $site, $r, $route, $from, $to, $filters) { $base = self::detailed($read, $from, $to); if (($read['site']['privacy_mode'] ?? 'standard') !== 'standard') return array_replace($base, ['status' => 'unsupported_in_this_mode', 'coverage' => 0, 'sessions' => [], 'identities' => [], 'events' => []]); if ($filters) return array_replace($base, ['status' => 'unsupported_identity_filters', 'coverage' => 0, 'sessions' => [], 'identities' => [], 'events' => []]); if ($base['coverage'] !== 1) return $base + ['sessions' => [], 'identities' => [], 'events' => []]; $events = self::identityEvents($app, $read, $site); $events = array_values(array_filter($events, fn($e) => AnalysisEngine::ms($e['ts']) >= AnalysisEngine::ms($from) && AnalysisEngine::ms($e['ts']) < AnalysisEngine::ms($to))); $key = fn($hash) => hash('sha256', json_encode([$site, $hash], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
            if ($route === 'identities') { $registration = $r->query['registrationEvent'] ?? 'signup'; if (!is_string($registration) || $registration === '' || strlen($registration) > 200) Http::error(400, 'invalid_registration_event'); $groups = []; foreach ($events as $e) $groups[$key($e['user_hash'])][] = $e; $identities = []; foreach ($groups as $userKey => $rows) { $registered = null; $paid = null; foreach ($rows as $e) { if (!$registered && $e['type'] === 'event' && ($e['payload']['event_name'] ?? '') === $registration) $registered = $e['ts']; if ($registered && !$paid && $e['type'] === 'revenue' && Decimal::compare($e['payload']['revenue'], '0') > 0 && AnalysisEngine::ms($e['ts']) > AnalysisEngine::ms($registered)) $paid = $e['ts']; } $sessions = AnalysisEngine::sessions($rows, $read['site']); $bucket = AnalysisEngine::merge(array_values(AnalysisEngine::buckets($rows, $sessions))); $identities[] = ['userKey' => $userKey, 'registeredAt' => $registered, 'paidAfterSignup' => $paid !== null, 'firstPaidAt' => $paid, 'sessions' => count($sessions), 'pages' => count(array_filter($rows, fn($e) => $e['type'] === 'pageview')), 'events' => count(array_filter($rows, fn($e) => $e['type'] === 'event')), 'revenueByCurrency' => (object)$bucket['revenueByCurrency'], 'firstSeen' => $rows[0]['ts'], 'lastSeen' => $rows[array_key_last($rows)]['ts']]; } $signupCount = count(array_filter($identities, fn($i) => $i['registeredAt'] !== null)); $paidAfterSignup = count(array_filter($identities, fn($i) => $i['paidAfterSignup'])); return $base + ['registrationEvent' => $registration, 'signupCount' => $signupCount, 'paidAfterSignup' => $paidAfterSignup, 'conversionRate' => $signupCount ? $paidAfterSignup / $signupCount : null, 'identities' => $identities, 'evidence' => ['from' => $from, 'to' => $to, 'scope' => 'selected_retained_window', 'positiveRevenueOnly' => true, 'paymentAfterRegistration' => 'strict_event_time', 'identity' => 'cross_device_temporal_binding']]; }
            if ($route === 'users/:userId/paths') { $hash = EventPrivacy::hash($read['site']['salt_secret'], 'identity', $r->params['userId']); $events = array_values(array_filter($events, fn($e) => $e['user_hash'] === $hash)); } else { if (!preg_match('/^[a-f0-9]{64}$/D', $r->params['userKey'])) Http::error(400, 'invalid_identity_key'); $events = array_values(array_filter($events, fn($e) => $key($e['user_hash']) === $r->params['userKey'])); }
            $sessions = AnalysisEngine::sessions($events, $read['site']); if ($route === 'users/:userId/paths') { $rows = []; foreach ($sessions as $s) { $paths = []; $behavior = []; foreach ($s['events'] as $e) { if ($e['type'] === 'pageview') $paths[] = ['path' => $e['path'], 'ts' => $e['ts']]; if ($e['type'] === 'event') $behavior[] = ['event_name' => $e['payload']['event_name'], 'ts' => $e['ts']]; } $rows[] = ['id' => $s['id'], 'visitor_id' => hash('sha256', $s['visitor_id']), 'started_at' => $s['started_at'], 'last_active' => $s['last_active'], 'paths' => $paths, 'events' => $behavior]; } return $base + ['user_id' => $r->params['userId'], 'sessions' => $rows]; } $ids = []; $sessionRows = []; foreach ($sessions as $s) { foreach ($s['events'] as $e) $ids[$e['event_id']] = $s['id']; $sessionRows[] = ['id' => $s['id'], 'startedAt' => $s['started_at'], 'lastActive' => $s['last_active'], 'pageviews' => $s['pageviews']]; } $activity = []; foreach ($events as $e) $activity[] = ['sessionId' => $ids[$e['event_id']] ?? null, 'ts' => $e['ts'], 'type' => $e['type'], 'path' => $e['path'], 'event_name' => $e['payload']['event_name'] ?? null, 'props' => (object)EventPrivacy::daily($e['payload']['props'] ?? []), 'currency' => $e['payload']['currency'] ?? null, 'value' => $e['payload']['revenue'] ?? null, 'page_id' => $e['page_id'], 'visitorKey' => hash('sha256', json_encode([$site, $e['visitor_id_original'], $e['binding_start']], JSON_THROW_ON_ERROR))]; return $base + ['sessions' => $sessionRows, 'events' => $activity]; }); });
    }
    private static function heatmapPoint(array $event): array
    {
        $point = $event['payload']['heatmap'];
        return ['site_id' => $event['site_id'], 'path' => $event['path'], 'kind' => $point['kind'], 'x' => (int)round($point['x'] * 100), 'y' => (int)round($point['y'] * 100), 'viewport' => (int)round($point['width'] / 100) * 100, 'coordinate_system' => 'document_percent', 'viewport_bucket_px' => 100];
    }
    private static function heatmapId(array $point): string { return $point['site_id'] . ':' . hash('sha256', json_encode($point, JSON_THROW_ON_ERROR)); }
    /** Caller holds the site lock. Missing state means old aggregates are not trusted. */
    private static function initializeHeatmap(App $app, string $siteId): array
    {
        $state = $app->store->get('heatmap_state', $siteId); if ($state) return $state;
        $read = self::read($app, $siteId); $site = $read['site']; $cutoff = $read['context']['rawCutoff'];
        $complete = isset($site['created_at']) && AnalysisEngine::ms($site['created_at']) >= $cutoff;
        $points = []; foreach ($read['events'] as $event) if ($event['type'] === 'heatmap' && isset($event['payload']['heatmap'])) {
            $point = self::heatmapPoint($event); $id = self::heatmapId($point); $points[$id] ??= $point + ['count' => 0]; $points[$id]['count']++;
        }
        $app->db->exec('DELETE FROM documents WHERE kind=? AND site_id=?', ['heatmap_points', $siteId]);
        foreach ($points as $id => $point) $app->store->put('heatmap_points', $id, $point, $siteId);
        $state = ['id' => $siteId, 'site_id' => $siteId, 'complete' => $complete, 'status' => $complete ? 'complete' : 'historical_heatmap_coverage_unavailable', 'method' => 'persistent_coordinate_counts', 'initialized_at' => Store::now(), 'evidence_from' => $complete ? $site['created_at'] : AnalysisEngine::iso($cutoff), 'watermark' => Store::now()];
        $app->store->put('heatmap_state', $siteId, $state, $siteId); return $state;
    }
    /** Called after intake validation/deduplication and BEFORE storing this event. */
    public static function recordHeatmap(App $app, array $event): void
    {
        if ($event['type'] !== 'heatmap') return;
        $app->db->transaction(function() use ($app, $event) {
            $site = $event['site_id']; $app->db->lock('site:' . $site); $state = self::initializeHeatmap($app, $site);
            $point = self::heatmapPoint($event); $id = self::heatmapId($point); $old = $app->store->get('heatmap_points', $id); $count = (int)($old['count'] ?? 0);
            if ($count >= PHP_INT_MAX) throw new \RuntimeException('heatmap_count_exhausted');
            $app->store->put('heatmap_points', $id, $point + ['count' => $count + 1], $site);
            $state['watermark'] = Store::now(); $app->store->put('heatmap_state', $site, $state, $site);
        });
    }
    private static function experienceText(array $query, string $key, int $max): void
    {
        if (isset($query[$key]) && (!is_string($query[$key]) || mb_strlen($query[$key]) > $max)) Http::error(400, 'invalid_' . $key);
    }
    private static function registerExperience(App $app, Router $router, string $base, callable $authorized): void
    {
        $router->add('GET', $base . '/heatmap', function(Http $r) use ($app, $authorized) {
            $site = $authorized($r); self::experienceText($r->query, 'path', 2048);
            if (isset($r->query['kind']) && !in_array($r->query['kind'], ['click', 'scroll'], true)) Http::error(400, 'invalid_heatmap_kind');
            $viewport = isset($r->query['viewport']) ? filter_var($r->query['viewport'], FILTER_VALIDATE_INT) : null;
            if (isset($r->query['viewport']) && ($viewport === false || $viewport < 0 || $viewport > 20000)) Http::error(400, 'invalid_viewport');
            return self::snapshot($app, $site, function($read) use ($app, $site, $r, $viewport) {
                $state = self::initializeHeatmap($app, $site); $points = [];
                foreach ($app->store->list('heatmap_points', $site) as $point) {
                    if (isset($r->query['path']) && $r->query['path'] !== $point['path'] || $viewport !== null && $viewport !== $point['viewport'] || isset($r->query['kind']) && $r->query['kind'] !== $point['kind']) continue;
                    $points[] = $point;
                }
                if (count($points) > 10000) Http::error(409, 'heatmap_point_limit', '热图超过 10000 个坐标桶，请按页面与视口筛选');
                usort($points, fn($a, $b) => strcmp($a['path'], $b['path']) ?: $a['viewport'] <=> $b['viewport'] ?: strcmp($a['kind'], $b['kind']) ?: $a['y'] <=> $b['y'] ?: $a['x'] <=> $b['x']);
                header('X-Baize-Event-Source: mysql'); header('X-Baize-Read-Coverage: ' . ($state['complete'] ? '1' : '0')); header('X-Baize-Read-Status: ' . $state['status']); header('X-Baize-Read-Method: ' . $state['method']); header('X-Baize-Evidence-From: ' . $state['evidence_from']); header('X-Baize-Watermark: ' . $state['watermark']);
                return $points;
            }, false);
        });
        $router->add('GET', $base . '/replay', function(Http $r) use ($app, $authorized) {
            $site = $authorized($r, 'admin'); $limit = filter_var($r->query['limit'] ?? 1000, FILTER_VALIDATE_INT); if ($limit === false || $limit < 1 || $limit > 1000) Http::error(400, 'invalid_limit');
            self::experienceText($r->query, 'path', 2048);
            if (isset($r->query['page_id']) && (!is_string($r->query['page_id']) || !preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/Di', $r->query['page_id']))) Http::error(400, 'invalid_page_id');
            $from = isset($r->query['from']) ? self::instant($r->query['from']) : null; $to = isset($r->query['to']) ? self::instant($r->query['to']) : null;
            if ($from !== null && $to !== null && $to <= $from) Http::error(400, 'invalid_range');
            return self::snapshot($app, $site, function($read) use ($app, $site, $r, $limit, $from, $to) {
                $rows = []; $cutoff = $read['context']['replayCutoff'];
                foreach ($app->store->list('replays', $site) as $row) {
                    $frames = EventPrivacy::filterReplay($app->store, $site, $row['visitor_id'], $row['payload'] ?? []);
                    $frames = array_values(array_filter($frames, fn($f) => (float)$f['timestamp'] >= $cutoff && ($from === null || (float)$f['timestamp'] >= $from) && ($to === null || (float)$f['timestamp'] < $to)));
                    if (!$frames || isset($r->query['path']) && $row['path'] !== $r->query['path'] || isset($r->query['page_id']) && $row['page_id'] !== $r->query['page_id']) continue;
                    $rows[] = ['session_id' => $row['session_id'], 'seq' => $row['seq'], 'payload' => $frames, 'page_id' => $row['page_id'], 'path' => $row['path'], 'started_at' => AnalysisEngine::iso(min(array_column($frames, 'timestamp'))), 'ended_at' => AnalysisEngine::iso(max(array_column($frames, 'timestamp'))), 'event_count' => count($frames)];
                }
                usort($rows, fn($a, $b) => strcmp($a['session_id'], $b['session_id']) ?: $a['seq'] <=> $b['seq']); $truncated = count($rows) > $limit; $outside = $from !== null && $from < $cutoff || $to !== null && $to <= $cutoff;
                header('X-Baize-Event-Source: mysql'); header('X-Baize-Truncated: ' . ($truncated ? 'true' : 'false')); header('X-Baize-Read-Coverage: ' . ($truncated || $outside ? '0' : '1')); header('X-Baize-Read-Status: ' . ($outside ? 'outside_replay_retention' : ($truncated ? 'truncated' : 'complete'))); header('X-Baize-Read-Method: retained_frames'); header('X-Baize-Evidence-From: ' . AnalysisEngine::iso($cutoff)); if ($read['context']['watermark']) header('X-Baize-Watermark: ' . $read['context']['watermark']); return array_slice($rows, 0, $limit);
            }, false);
        });
    }
    private static function realtime(App $app, string $site): array
    {
        return self::snapshot($app, $site, function($read) { $now = microtime(true) * 1000; $events = array_values(array_filter($read['events'], fn($e) => AnalysisEngine::ms($e['ts']) >= $now - 30 * 60000 && AnalysisEngine::ms($e['ts']) < $now)); $activity = array_values(array_filter($events, fn($e) => $e['type'] === 'pageview')); $heartbeats = array_filter($events, fn($e) => $e['type'] === 'heartbeat' && AnalysisEngine::ms($e['ts']) >= $now - 5 * 60000); $online = []; foreach ($heartbeats as $e) $online[$e['visitor_id']] = true;
            $group = function(callable $dimensions) use ($activity) { $groups = []; foreach ($activity as $e) { $d = $dimensions($e); $k = json_encode($d, JSON_THROW_ON_ERROR); $groups[$k] ??= $d + ['pv' => 0, 'visitors' => []]; $groups[$k]['pv']++; $groups[$k]['visitors'][$e['visitor_id']] = true; } $rows = self::rows($groups, 'pv', 20); foreach ($rows as &$row) { $row['uv'] = count($row['visitors']); unset($row['visitors']); } return $rows; };
            $preview = []; foreach (array_slice(array_reverse($events), 0, 200) as $e) $preview[] = array_intersect_key($e, array_flip(['event_id', 'ts', 'type', 'path', 'dimensions'])); return ['online' => count($online), 'onlineCoverage' => 1, 'storage' => ['source' => 'mysql', 'coverage' => 1, 'truncated' => count($events) > 200], 'events' => $preview, 'topPages' => $group(fn($e) => ['path' => $e['path']]), 'topSources' => $group(fn($e) => ['channel' => $e['dimensions']['channel'] ?? 'unknown', 'referrer' => $e['dimensions']['referrer'] ?? '']), 'topGeography' => $group(fn($e) => ['country' => $e['dimensions']['country'] ?? 'unknown', 'region' => $e['dimensions']['region'] ?? 'unknown', 'city' => $e['dimensions']['city'] ?? 'unknown']), 'realtime' => ['status' => 'complete', 'coverage' => 1, 'from' => AnalysisEngine::iso($now - 30 * 60000), 'to' => AnalysisEngine::iso($now), 'onlineFrom' => AnalysisEngine::iso($now - 5 * 60000), 'method' => 'exact_distinct_pageview_window', 'pv' => count($activity), 'limit' => self::EVENT_LIMIT, 'truncated' => false]];
        });
    }
    public static function streamEvents(App $app, string $site, string $resume = '0', int $limit = 200): array
    {
        if (!preg_match('/^\d{1,19}$/D', $resume) || Decimal::compare($resume, (string)PHP_INT_MAX) > 0) $resume = '0';
        if ($limit < 1 || $limit > 200) throw new \InvalidArgumentException('invalid_stream_limit');
        return self::snapshot($app, $site, function($read) use ($resume, $limit) {
            $frontier = microtime(true) * 1000 - 30 * 60000; $pending = [];
            foreach ($read['events'] as $event) if (isset($event['cursor_id'], $event['received_at']) && (int)$event['cursor_id'] > (int)$resume && AnalysisEngine::ms($event['ts']) >= $frontier && AnalysisEngine::ms($event['received_at']) >= $frontier) $pending[] = $event;
            usort($pending, fn($a, $b) => (int)$a['cursor_id'] <=> (int)$b['cursor_id']); $truncated = count($pending) > $limit; $events = [];
            foreach (array_slice($pending, 0, $limit) as $event) $events[] = array_intersect_key($event, array_flip(['event_id', 'ts', 'type', 'path', 'dimensions', 'cursor_id'])) + ['storage' => ['source' => 'mysql', 'method' => 'site_monotonic_intake_cursor', 'coverage' => 1, 'truncated' => $truncated]];
            return ['events' => $events, 'truncated' => $truncated, 'cursor' => $events ? (string)$events[array_key_last($events)]['cursor_id'] : $resume];
        });
    }
    private static function registerRealtime(App $app, Router $router, string $base, callable $authorized): void
    {
        $router->add('GET', $base . '/realtime', fn(Http $r) => self::realtime($app, $authorized($r)));
        $router->add('GET', $base . '/realtime/stream', function(Http $r) use ($app, $authorized) { $site = $authorized($r); $data = self::streamEvents($app, $site, $r->header('last-event-id') ?? '0'); header('Content-Type: text/event-stream'); header('Cache-Control: no-cache'); header('X-Accel-Buffering: no'); foreach ($data['events'] as $e) { echo 'id: ' . $e['cursor_id'] . "\ndata: " . json_encode($e, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE) . "\n\n"; } echo ": heartbeat\n\nretry: 2000\n\n"; return null; });
    }
    public static function experimentComparison(int $visitors, int $conversions, int $controlVisitors, int $controlConversions, int $comparisons = 1): array
    {
        $rate = $visitors ? $conversions / $visitors : 0; $controlRate = $controlVisitors ? $controlConversions / $controlVisitors : 0; $z = 1.95996398454; $n = max(1, $visitors); $denominator = 1 + $z ** 2 / $n; $center = ($rate + $z ** 2 / (2 * $n)) / $denominator; $margin = $z * sqrt($rate * (1 - $rate) / $n + $z ** 2 / (4 * $n ** 2)) / $denominator; $sufficient = $visitors > 0 && $controlVisitors > 0 && min($conversions, $visitors - $conversions, $controlConversions, $controlVisitors - $controlConversions) >= 5; $p = null; $score = null; if ($sufficient) { $pooled = ($conversions + $controlConversions) / ($visitors + $controlVisitors); $se = sqrt($pooled * (1 - $pooled) * (1 / $visitors + 1 / $controlVisitors)); $score = $se ? ($rate - $controlRate) / $se : 0; $x = abs($score) / sqrt(2); $t = 1 / (1 + .3275911 * $x); $erf = 1 - (((((1.061405429 * $t - 1.453152027) * $t) + 1.421413741) * $t - .284496736) * $t + .254829592) * $t * exp(-$x * $x); $p = min(1, max(0, (1 - $erf) * max(1, $comparisons))); } return ['rate' => $rate, 'control_rate' => $controlRate, 'absolute_lift' => $rate - $controlRate, 'relative_lift' => $controlRate ? $rate / $controlRate - 1 : null, 'confidence_interval' => $visitors ? [max(0, $center - $margin), min(1, $center + $margin)] : null, 'p_value' => $p, 'z_score' => $score, 'significant' => $p !== null && $p < .05, 'status' => $sufficient ? 'eligible_fixed_horizon' : 'insufficient_sample', 'method' => 'two_proportion_z_test_bonferroni', 'limitations' => ['固定周期分析；反复查看或提前停止会增加误报。', '访客随机分配且独立；未验证订单支付事实。']];
    }
    private static function registerExperiments(App $app, Router $router, string $base, callable $authorized): void
    {
        $router->add('POST', $base . '/experiments', function(Http $r) use ($app, $authorized) { $site = $authorized($r, 'admin'); $b = $r->body; if (!is_string($b['name'] ?? null) || trim($b['name']) === '' || strlen($b['name']) > 512 || !is_string($b['goal'] ?? null) || $b['goal'] === '' || strlen($b['goal']) > 128 || !is_array($b['variants'] ?? null) || count($b['variants']) < 2 || count($b['variants']) > 10) Http::error(400, 'invalid_experiment'); foreach ($b['variants'] as $v) if (!is_string($v) || trim($v) === '' || strlen($v) > 64) Http::error(400, 'invalid_experiment'); $variants = array_map('trim', $b['variants']); if (count(array_unique($variants)) !== count($variants)) Http::error(400, 'invalid_experiment'); $id = Store::uuid(); $app->store->put('experiments', $id, ['id' => $id, 'site_id' => $site, 'name' => trim($b['name']), 'goal' => $b['goal'], 'variants' => $variants, 'enabled' => true, 'conversion_history_status' => 'complete', 'created_at' => Store::now()], $site); $app->audit($app->auth->user($r)['id'], $site, 'experiment.create', ['id' => $id]); return ['id' => $id]; });
        $router->add('PATCH', $base . '/experiments/:id', function(Http $r) use ($app, $authorized) { $site = $authorized($r, 'admin'); if (!is_bool($r->body['enabled'] ?? null)) Http::error(400, 'invalid_experiment'); return $app->db->transaction(function() use ($app, $r, $site) { $app->db->lock('site:' . $site); $e = self::owned($app, 'experiments', $r->params['id'], $site); $e['enabled'] = $r->body['enabled']; $app->store->put('experiments', $e['id'], $e, $site); $app->audit($app->auth->user($r)['id'], $site, 'experiment.update', ['id' => $e['id'], 'enabled' => $e['enabled']]); return ['id' => $e['id'], 'enabled' => $e['enabled']]; }); });
        $router->add('GET', $base . '/experiments', function(Http $r) use ($app, $authorized) { $site = $authorized($r); return self::snapshot($app, $site, function($read) use ($app, $site) { $assignments = $app->store->list('experiment_assignments', $site); $contributions = $app->store->list('experiment_contributions', $site); $live = []; foreach ($read['events'] as $e) $live[$e['event_id']] = true; $rows = []; foreach ($app->store->list('experiments', $site) as $definition) { $counts = []; foreach ($definition['variants'] as $variant) $counts[$variant] = ['visitors' => 0, 'conversions' => 0]; foreach ($assignments as $a) { if ($a['experiment_id'] !== $definition['id'] || !isset($counts[$a['variant']]) || self::deletedBy(array_values(array_filter($read['privacyRecords'], fn($p) => $p['type'] !== 'retention')), ['visitor_id' => $a['visitor_id'], 'ts' => $a['assigned_at'] ?? $definition['created_at'] ?? Store::now(), 'payload' => []])) continue; $counts[$a['variant']]['visitors']++; foreach ($contributions as $c) if ($c['experiment_id'] === $definition['id'] && $c['visitor_id'] === $a['visitor_id'] && !self::deletedBy(array_values(array_filter($read['privacyRecords'], fn($p) => $p['type'] !== 'retention')), $c) && (!isset($a['assigned_at']) || AnalysisEngine::ms($c['ts']) >= AnalysisEngine::ms($a['assigned_at']))) { $counts[$a['variant']]['conversions']++; break; } } $control = $counts[$definition['variants'][0]]; foreach ($counts as $variant => $n) $rows[] = $definition + ['variant' => $variant] + $n + ['control_variant' => $definition['variants'][0], 'comparison' => ($definition['conversion_history_status'] ?? 'complete') === 'complete' ? self::experimentComparison($n['visitors'], $n['conversions'], $control['visitors'], $control['conversions'], count($counts) - 1) : ['status' => 'partial_history_unavailable', 'significant' => false, 'p_value' => null]]; } return $rows; }); });
        $router->add('OPTIONS', '/api/v1/experiments/:id/assign', function(Http $r) use ($app) { $experiment = $app->store->get('experiments', $r->params['id']); $site = $experiment ? $app->store->get('sites', $experiment['site_id']) : null; $origin = $r->header('origin'); if (!$site || !$origin || !Collect::origin($site, $origin)) Http::error(403, 'origin_forbidden'); return Http::json(null, 204, ['Access-Control-Allow-Origin' => $origin, 'Access-Control-Allow-Methods' => 'POST, OPTIONS', 'Access-Control-Allow-Headers' => 'Content-Type', 'Vary' => 'Origin']); });
        $router->add('POST', '/api/v1/experiments/:id/assign', function(Http $r) use ($app) { $site = $r->body['site_id'] ?? ''; $visitor = $r->body['visitor_id'] ?? ''; if (!is_string($site) || !is_string($visitor) || $visitor === '' || strlen($visitor) > 128 || ($r->body['consent'] ?? false) !== true) Http::error(400, 'invalid_assignment'); return $app->db->transaction(function() use ($app, $r, $site, $visitor) { $app->db->lock('site:' . $site); $s = $app->store->get('sites', $site); $e = self::owned($app, 'experiments', $r->params['id'], $site); if (!$s || ($s['privacy_mode'] ?? 'standard') !== 'standard' || !($s['config']['experiments'] ?? false) || !($e['enabled'] ?? true)) Http::error(409, 'experiment_unavailable'); if (!$r->header('origin') || !Collect::origin($s, $r->header('origin'))) Http::error(403, 'origin_forbidden'); if (EventPrivacy::deleted($app->store, $site, ['visitor_id' => $visitor, 'ts' => Store::now(), 'payload' => []])) Http::error(409, 'visitor_deleted'); $id = $e['id'] . ':' . $visitor; $assignment = $app->store->get('experiment_assignments', $id); if (!$assignment) { $variant = $e['variants'][hexdec(substr(hash('sha256', $e['id'] . ':' . $visitor), 0, 8)) % count($e['variants'])]; $assignment = ['id' => $id, 'site_id' => $site, 'experiment_id' => $e['id'], 'visitor_id' => $visitor, 'variant' => $variant, 'assigned_at' => Store::now()]; $app->store->put('experiment_assignments', $id, $assignment, $site); } header('Access-Control-Allow-Origin: ' . ($r->header('origin') ?? '')); header('Vary: Origin'); return ['variant' => $assignment['variant']]; }); });
    }
}
