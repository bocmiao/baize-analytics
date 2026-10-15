<?php
declare(strict_types=1);
require dirname(__DIR__) . '/bootstrap.php';
use Baize\{AnalysisEngine as Engine, Analytics, App, Collect, Database, Decimal, EventPrivacy, Governance, Http, HttpError, Router, Security, Sessionizer, Store, Worker};

$checks = 0;
$assert = function(bool $condition, string $message) use (&$checks): void { $checks++; if (!$condition) throw new RuntimeException($message); };
$equal = function(mixed $actual, mixed $expected, string $message) use ($assert): void { $assert($actual === $expected, $message . ': ' . json_encode($actual, JSON_UNESCAPED_UNICODE) . ' !== ' . json_encode($expected)); };
$now = Engine::ms('2026-10-15T12:00:00.000Z'); $base = $now - 3600000;
$site = ['id' => 'analysis', 'name' => '统计测试', 'domain' => 'example.com', 'timezone' => 'UTC', 'privacy_mode' => 'standard', 'retention_days' => 30, 'salt_secret' => 'analysis-test-secret', 'created_at' => Engine::iso($now - 60 * 86400000), 'config' => ['replay' => true, 'heatmap' => true, 'experiments' => true]];
$event = function(string $id, float $at, string $type = 'pageview', string $path = '/a', string $visitor = 'visitor-a', array $payload = [], array $dimensions = []) use ($site): array { return ['site_id' => $site['id'], 'event_id' => $id, 'ts' => Engine::iso($at), 'visitor_id' => $visitor, 'page_id' => 'page-' . $path, 'type' => $type, 'path' => $path, 'payload' => $payload, 'dimensions' => $dimensions + ['channel' => 'search', 'device' => 'desktop'], 'is_bot' => false]; };

$equal(Decimal::add('0.000000000000000001', '0.000000000000000002'), '0.000000000000000003', 'micro revenue exact');
$equal(Decimal::add('999999999999999999999999.9999', '0.0001'), '1000000000000000000000000', 'arbitrary precision carry');
$equal(Decimal::add('-0.3', '0.1'), '-0.2', 'negative refund exact');
$equal(Decimal::add('1e-18', '-1e-18'), '0', 'scientific notation and cancellation');
$equal(Decimal::normalize('0001.2300e-3'), '0.00123', 'normalization');
$equal(Decimal::compare('-1', '-2'), 1, 'negative decimal compare');
$equal(Decimal::compare('0.000000000000000001', '0'), 1, 'micro positive');

$events = [$event('a', $base), $event('b', $base + 20000, 'pageview', '/b'), $event('r1', $base + 30000, 'revenue', '/b', 'visitor-a', ['revenue' => '0.000000000000000001', 'currency' => 'USD', 'order_id' => 'one']), $event('r2', $base + 31000, 'revenue', '/b', 'visitor-a', ['revenue' => '0.000000000000000002', 'currency' => 'USD', 'order_id' => 'two'])];
$events[] = $events[1]; $events[] = $event('order-alias', $base + 32000, 'revenue', '/b', 'visitor-a', ['revenue' => '0.000000000000000001', 'currency' => 'USD', 'order_id' => 'one']);
$goals = [['id' => 'goal-b', 'name' => '到达 B', 'type' => 'page', 'config' => ['path' => '/b']]];
$stats = Engine::stats($site, $events, Engine::iso($base + 10000), Engine::iso($base + 50000), $goals, [], [], $now);
$equal($stats['totals']['pv'], 1, 'exclusive event window deduplicated');
$equal($stats['totals']['sessions'], 0, 'session remains attributed to landing outside selection');
$equal(((array)$stats['goals'])['goal-b'], 1, 'goal completion event time');
$equal(((array)$stats['totals']['revenueByCurrency'])['USD'], '0.000000000000000003', 'orders dedup plus micro sums');
$equal($stats['totals']['revenue'], '0.000000000000000003', 'single-currency amount exact string');
$equal($stats['paths'][0]['source'], '/a', 'path keeps context before query frontier');
$equal($stats['paths'][0]['target'], '/b', 'path target in interval');
$equal($stats['revenueAttributionRows'][0]['channel'], 'search', 'last non-direct attribution');

$events[] = $event('eur', $base + 33000, 'revenue', '/b', 'visitor-a', ['revenue' => '-0.0000001', 'currency' => 'EUR', 'order_id' => 'euro']);
$mixed = Engine::stats($site, $events, Engine::iso($base), Engine::iso($now), [], [], [], $now);
$equal($mixed['totals']['revenue'], null, 'mixed currencies never merged');
$equal(((array)$mixed['totals']['revenueByCurrency'])['EUR'], '-0.0000001', 'refund retained in own currency');

$heartbeats = [$event('pv', $base), $event('h1', $base + 10000, 'heartbeat', '/a', 'visitor-a', ['visible_ms' => 20000, 'interval_start' => 0, 'interval_end' => 10000]), $event('h2', $base + 11000, 'heartbeat', '/a', 'visitor-a', ['visible_ms' => 10000, 'interval_start' => 0, 'interval_end' => 10000]), $event('scroll', $base + 12000, 'event', '/a', 'visitor-a', ['event_name' => 'scroll', 'props' => ['depth' => 100]]), $event('scroll2', $base + 13000, 'event', '/a', 'visitor-a', ['event_name' => 'scroll', 'props' => ['depth' => 100]])];
$h = Engine::stats($site, $heartbeats, Engine::iso($base), Engine::iso($now), [], [], [], $now);
$equal($h['totals']['visibleSeconds'], 10.0, 'heartbeat repeated interval dedup capped');
$equal($h['totals']['bounceRate'], 0, 'session duration changes bounce');
$equal($h['pages'][0]['completionRate'], 1, 'scroll completion per page instance');

$funnel = ['id' => 'f', 'steps' => [['type' => 'page', 'value' => '/a'], ['type' => 'event', 'value' => 'buy']], 'strict' => false];
$journey = [$event('fpv', $base), $event('noise', $base + 1, 'event', '/a', 'visitor-a', ['event_name' => 'noise']), $event('buy', $base + 2, 'event', '/a', 'visitor-a', ['event_name' => 'buy']), $event('drop', $base, 'pageview', '/a', 'visitor-b')];
$sessions = Engine::sessions($journey, $site);
$equal(array_map('count', Engine::funnelVisitors($sessions, $funnel['steps'], false)), [2, 1], 'loose funnel accepts intervening event');
$equal(array_map('count', Engine::funnelVisitors($sessions, $funnel['steps'], true)), [2, 0], 'strict funnel stops on intervening event');
$drop = Engine::dropoff($sessions, $funnel);
$equal($drop[0]['lost'], 1, 'dropoff set difference counts visitor');
$journey[] = $event('later-start', $base + 3600000, 'pageview', '/a', 'visitor-b'); $journey[] = $event('later-buy', $base + 3600001, 'event', '/a', 'visitor-b', ['event_name' => 'buy']);
$equal(Engine::dropoff(Engine::sessions($journey, $site), $funnel)[0]['lost'], 0, 'completion in another eligible session removes visitor from loss');

$daily = $site; $daily['privacy_mode'] = 'daily_salt'; $midnight = [$event('day1', Engine::ms('2026-10-13T23:59:59Z')), $event('day2', Engine::ms('2026-10-14T00:00:01Z'))];
$equal(count(Engine::sessions($midnight, $daily)), 2, 'daily salt splits sessions by local day');
$privacyStats = Engine::stats($daily, $midnight, '2026-10-13T23:59:00Z', '2026-10-14T00:01:00Z', [], [$funnel], [], $now);
$equal($privacyStats['totals']['uv'], null, 'daily salt cross-day UV unavailable');
$equal($privacyStats['funnelStatus'], 'unsupported_in_this_mode', 'daily salt cross-day funnel unavailable');
$equal($privacyStats['retention']['status'], 'unsupported_in_this_mode', 'daily salt retention unavailable');
$halfHourSite = $daily; $halfHourSite['timezone'] = 'Asia/Kolkata'; $halfHourEvents = [$event('half1', Engine::ms('2026-10-13T18:29:59Z')), $event('half2', Engine::ms('2026-10-13T18:30:01Z'))]; $halfHourStats = Engine::stats($halfHourSite, $halfHourEvents, '2026-10-13T18:20:00Z', '2026-10-13T18:40:00Z', [], [], [], $now); $equal($halfHourStats['trend'][0]['uv'], null, 'daily salt UTC hour crossing local midnight does not infer UV');

$vitals = [$event('vp', $base)]; foreach ([10, 20, 30, 40] as $i => $v) $vitals[] = $event('v' . $i, $base + $i + 1, 'vitals', '/a', 'visitor-a', ['vitals' => ['lcp' => $v]]);
$v = Engine::stats($site, $vitals, Engine::iso($base), Engine::iso($now), [], [], [], $now);
$equal($v['vitals'][0]['p75'], 32.5, 'exact type7 quantile'); $equal($v['vitals'][0]['sampleCount'], 4, 'vitals sample count');
$equal(Engine::quantile([['mean' => 10, 'n' => 10], ['mean' => 20, 'n' => 2]], .75), 10.0, 'weighted centroid point masses');

$short = $site; $short['retention_days'] = 1; $boundary = $now - 86400000; $edge = [$event('edge', $boundary + 1000)];
$edgeStats = Engine::stats($short, $edge, Engine::iso($boundary), Engine::iso($boundary + 60000), [], [], [], $now);
$equal($edgeStats['totals']['pv'], 1, 'retention frontier PV exact'); $equal($edgeStats['totals']['sessions'], null, 'left-censored session not guessed'); $equal($edgeStats['sessionMetricsStatus'], 'partial_session_context', 'left context explicitly unavailable');
$historical = Engine::buckets([$event('history', $boundary - 3600000)], Engine::sessions([$event('history', $boundary - 3600000)], $short));
$archive = []; foreach ($historical as $hour => $data) $archive[] = ['hour' => $hour, 'data' => $data, 'complete' => true];
$archiveStats = Engine::stats($short, [], Engine::iso($boundary - 3600000), Engine::iso($boundary), [], [], [], $now, ['archives' => $archive]);
$equal($archiveStats['totals']['pv'], 1, 'persisted complete hour history readable'); $equal($archiveStats['coverage'], 1, 'historical coverage grounded in archive');
$invalidDefinitions = $archive; $invalidDefinitions[0]['data']['definitionsUnavailable'] = true; $invalidDefinitions[0]['data']['goals'] = ['old-goal' => 10];
$invalidStats = Engine::stats($short, [], Engine::iso($boundary - 3600000), Engine::iso($boundary), [], [], [], $now, ['archives' => $invalidDefinitions]);
$equal($invalidStats['totals']['pv'], 1, 'definition changes retain unrelated archive PV evidence'); $equal($invalidStats['totals']['conversions'], null, 'old definition conversions explicitly unavailable'); $equal($invalidStats['funnelStatus'], 'definition_history_unavailable', 'old archived funnel never presented under new definition');
$missing = Engine::stats($short, [], Engine::iso($boundary - 3500000), Engine::iso($boundary), [], [], [], $now, ['archives' => $archive]);
$equal($missing['coverage'], 0, 'nonintegral expired interval unavailable'); $equal($missing['rangeStatus'], 'partial_unavailable', 'historical boundary status');
$filtered = Engine::stats($short, [], Engine::iso($boundary - 3600000), Engine::iso($boundary), [], [], ['path' => '/a'], $now, ['archives' => $archive]); $equal($filtered['coverage'], 0, 'expired filtered query never uses marginal archive');

$retentionEvents = [$event('first', Engine::ms('2026-10-10T10:00:00Z')), $event('return', Engine::ms('2026-10-11T10:00:00Z'))];
$retention = Engine::retention($site, $retentionEvents, '2026-10-10T00:00:00Z', '2026-10-15T00:00:00Z', $now, [], ['firstSeenComplete' => true, 'firstSeen' => [['visitor_id' => 'visitor-a', 'first_date' => '2026-10-10']]]);
$cohorts = (array)$retention['cohorts']; $equal($cohorts['2026-10-10']['observations']['1']['returned'], 1, 'calendar-day return'); $equal($cohorts['2026-10-10']['observations']['2']['returned'], 0, 'complete absent return is zero'); $equal($cohorts['2026-10-10']['observations']['5']['returned'], null, 'immature return is unavailable');
$equal(Engine::retention($site, $retentionEvents, '2026-10-10T00:00:00Z', '2026-10-15T00:00:00Z', $now)['retention']['status'], 'first_visit_history_unavailable', 'missing first-visit ledger never inferred');
$dstSite = $site; $dstSite['timezone'] = 'America/New_York'; $dst = Engine::retention($dstSite, [], '2026-10-31T04:00:00Z', '2026-11-04T05:00:00Z', Engine::ms('2026-11-05T12:00:00Z'), [], ['firstSeenComplete' => true, 'firstSeen' => [['visitor_id' => 'v', 'first_date' => '2026-10-31']]]); $dstCohorts = (array)$dst['cohorts']; $equal(Engine::ms($dstCohorts['2026-10-31']['observations']['1']['to']) - Engine::ms($dstCohorts['2026-10-31']['observations']['1']['from']), 25.0 * 3600000, 'calendar retention follows DST');
$assert(Analytics::experimentComparison(100, 30, 100, 10)['significant'], 'experiment z-test detects sufficient fixed-horizon difference');
$equal(Analytics::experimentComparison(4, 1, 4, 2)['status'], 'insufficient_sample', 'small sample no significance');
$equal(Analytics::normalizeRegion('CN', 'Guangdong'), '广东', 'province alias');

// Exercise real MySQL/MariaDB storage, auth, collector, deletion filters and the unchanged frontend routes.
$port = (int)(getenv('BAIZE_TEST_DB_PORT') ?: 3307); $name = 'baize_analytics_' . getmypid();
$server = new PDO("mysql:host=127.0.0.1;port=$port;charset=utf8mb4", 'root', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$server->exec("CREATE DATABASE `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin"); $directory = sys_get_temp_dir() . '/' . $name; mkdir($directory, 0700, true);
try {
    $db = new Database(['dsn' => "mysql:host=127.0.0.1;port=$port;dbname=$name;charset=utf8mb4", 'user' => 'root', 'password' => '']); $db->migrate();
    $app = new App(['data_dir' => $directory, 'key_dir' => $directory, 'public_url' => 'https://analytics.example.com', 'master_key' => random_bytes(32)], $db); $router = new Router(); Analytics::register($app, $router);
    $realNow = (int)floor(microtime(true) * 1000); $site['created_at'] = Engine::iso($realNow - 86400000); $app->store->put('sites', $site['id'], $site, $site['id']);
    $app->store->put('users', 'owner', ['id' => 'owner', 'email' => 'owner@example.com', 'is_admin' => true]); $token = str_repeat('a', 32); $hash = Security::hashToken($token); $app->store->put('auth_sessions', $hash, ['user_id' => 'owner', 'expires_at' => Engine::iso($realNow + 3600000)]);
    $request = function(string $method, string $path, array $body = [], array $query = [], array $headers = []) use ($router, $token) { return $router->dispatch(new Http($method, '/api/v1/sites/analysis/' . $path, $body, $headers + ['cookie' => 'baize_session=' . $token], $query)); };
    $visitor = Store::uuid(); $page = Store::uuid();
    $wire = function(string $type, int $at, array $extra = []) use ($visitor, $page): array { return $extra + ['event_id' => Store::uuid(), 'type' => $type, 'ts' => $at, 'visitor_id' => $visitor, 'page_id' => $page, 'url' => 'https://example.com/a', 'path' => '/a', 'props' => (object)[]]; };
    $send = function(array $events) use ($app, $realNow) { return Collect::ingest($app, new Http('POST', '/api/collect', ['protocol_version' => 1, 'site_id' => 'analysis', 'sdk' => 'analytics-test', 'sent_at' => $realNow, 'events' => $events], ['origin' => 'https://example.com', 'user-agent' => 'Mozilla/5.0 Chrome/128.0.0.0 Safari/537.36'])); };
    $range = ['from' => Engine::iso($realNow - 600000), 'to' => Engine::iso($realNow + 1000)];
    $goal = $request('POST', 'goals', ['name' => '购买', 'type' => 'event', 'config' => ['event_name' => 'buy']]);
    $equal(count($request('GET', 'goals')), 1, 'goal CRUD route');
    $request('PUT', 'goals/' . $goal['id'], ['name' => '付费', 'type' => 'event', 'config' => ['event_name' => 'buy']]);
    $f = $request('POST', 'funnels', ['name' => '购买漏斗', 'steps' => [['type' => 'page', 'value' => '/a'], ['type' => 'event', 'value' => 'buy']], 'strict' => false]);
    $experiment = $request('POST', 'experiments', ['name' => '按钮', 'variants' => ['control', 'blue'], 'goal' => 'buy']);
    try { $router->dispatch(new Http('POST', '/api/v1/experiments/' . $experiment['id'] . '/assign', ['site_id' => 'analysis', 'visitor_id' => $visitor, 'consent' => true], ['origin' => 'https://evil.test'])); $assert(false, 'experiment bad origin rejected'); } catch (HttpError $e) { $equal($e->status, 403, 'experiment origin enforced'); }
    $assigned = $router->dispatch(new Http('POST', '/api/v1/experiments/' . $experiment['id'] . '/assign', ['site_id' => 'analysis', 'visitor_id' => $visitor, 'consent' => true], ['origin' => 'https://example.com'])); $assert(in_array($assigned['variant'], ['control', 'blue'], true), 'experiment real assignment');
    $equal($router->dispatch(new Http('OPTIONS', '/api/v1/experiments/' . $experiment['id'] . '/assign', [], ['origin' => 'https://example.com'])), null, 'browser cross-origin experiment preflight succeeds');
    $at = (int)floor(microtime(true) * 1000); $records = [$wire('pageview', $at - 1000), $wire('identify', $at - 900, ['user_id' => 'alice']), $wire('event', $at, ['event_name' => 'signup', 'props' => ['plan' => 'pro']]), $wire('event', $at + 1, ['event_name' => 'buy', 'props' => ['price' => 1, 'flag' => true]]), $wire('revenue', $at + 2, ['revenue' => '0.000000000000000001', 'currency' => 'USD', 'order_id' => 'purchase']), $wire('event', $at + 3, ['event_name' => 'download', 'props' => ['url' => 'https://example.com/report.pdf']]), $wire('pageview', $at + 4, ['props' => ['status' => 404], 'path' => '/missing']), $wire('heatmap', $at + 5, ['heatmap' => ['kind' => 'click', 'x' => .25, 'y' => .75, 'width' => 1440, 'height' => 900]]), $wire('replay', $at + 6, ['replay_seq' => 0, 'replay' => [['type' => 3, 'timestamp' => $at - 500, 'data' => ['text' => '***']], ['type' => 3, 'timestamp' => $at + 6, 'data' => ['text' => '****']]]])];
    $ingest = $send($records); $equal($ingest['accepted'], count($records), 'collector accepts analytics integration dataset');
    // Wait-free fixed query end: engine future clamp intentionally excludes future fixture milliseconds until the database calls complete.
    $stats = $request('GET', 'stats', [], $range + ['compare' => 'previous']); $equal($stats['totals']['pv'], 2, 'MySQL stats actual PV'); $equal($stats['totals']['revenue'], '0.000000000000000001', 'MySQL micro revenue survives JSON'); $assert(isset($stats['comparison']), 'comparison route');
    $equal($request('GET', 'pages/detail', [], $range + ['path' => '/missing'])['totals']['pv'], 1, 'exact page filter recomputes detail');
    $geo = $request('GET', 'geography', [], $range); $equal($geo['countries'][0]['country'], 'unknown', 'no GeoIP never invents a country'); $equal($geo['geographyCoverage'], 0, 'unknown geography coverage truthful');
    try { $request('GET', 'stats', [], ['from' => '2026-02-30T00:00:00Z', 'to' => '2026-03-01T00:00:00Z']); $assert(false, 'invalid calendar date'); } catch (HttpError $e) { $equal($e->status, 400, 'invalid calendar range rejected'); }
    $content = $request('GET', 'content', [], $range); $equal($content['downloads'][0]['fileType'], 'pdf', 'content download extension'); $equal($content['notFound'][0]['path'], '/missing', '404 actual status');
    $properties = $request('GET', 'event-properties', [], $range + ['event_name' => 'buy', 'property' => 'flag']); $equal($properties['typedGroups'][0]['value'], true, 'typed property bool stays bool');
    $revenue = $request('GET', 'revenue', [], $range); $equal($revenue['trend'][0]['amount'], '0.000000000000000001', 'revenue API exact amount'); $equal($revenue['storage']['source'], 'mysql', 'revenue retains observed storage source'); $assert(array_key_exists('generation', $revenue['storage']) && isset($revenue['storage']['method'], $revenue['storage']['coverage']), 'revenue storage includes explicit version/method/coverage'); $equal($properties['storage']['source'], 'mysql', 'event property read source retained');
    $analysis = $request('GET', 'analysis', [], $range); $equal($analysis['goals'][0]['conversions'], 1, 'analysis goal conversion');
    $funnelResult = $request('GET', 'funnels/' . $f['id'] . '/analysis', [], ['from' => $range['from'], 'to' => Engine::iso($at + 6)]); $equal($funnelResult['steps'][0]['completed'], 1, 'funnel actual event-time cohort');
    $heat = $request('GET', 'heatmap'); $equal($heat[0]['x'], 25, 'heatmap document percent'); $equal($heat[0]['viewport'], 1400, 'heatmap viewport bucket');
    $replay = $request('GET', 'replay'); $equal($replay[0]['event_count'], 2, 'masked replay real frames');
    $identities = $request('GET', 'identities', [], $range); $equal($identities['storage']['source'], 'mysql', 'identity read source retained'); $equal($identities['signupCount'], 1, 'temporal identity registration'); $equal($identities['paidAfterSignup'], 1, 'temporal identity payment follows signup');
    $paths = $request('GET', 'users/alice/paths', [], $range); $equal(count($paths['sessions']), 1, 'known user path projection');
    $activity = $request('GET', 'identities/' . $identities['identities'][0]['userKey'] . '/activity', [], $range); $assert(count($activity['events']) >= 4, 'opaque identity key activity');
    $experimentRows = $request('GET', 'experiments'); $equal(array_sum(array_column($experimentRows, 'conversions')), 1, 'collector assignment contribution report');
    $realtime = $request('GET', 'realtime'); $equal($realtime['realtime']['pv'], 2, 'realtime complete PV window'); $equal($realtime['topPages'][0]['uv'], 1, 'realtime top page exact visitors');
    $stream = Analytics::streamEvents($app, 'analysis'); $assert(count($stream['events']) >= count($records), 'stream uses actual persisted collector cursors'); $resume = $stream['cursor']; $late = $wire('event', $at - 100, ['event_name' => 'late']); $equal($send([$late])['accepted'], 1, 'late event accepted'); $resumed = Analytics::streamEvents($app, 'analysis', $resume); $equal($resumed['events'][0]['event_id'], $late['event_id'], 'monotonic SSE cursor includes late event after reconnect'); $equal($send([$late])['duplicates'], 1, 'late event retry idempotent'); $equal(Analytics::streamEvents($app, 'analysis', $resumed['cursor'])['events'], [], 'duplicate does not create another stream item');
    $historyStart = floor(($realNow - 86400000) / 3600000) * 3600000; $historyHour = Engine::iso($historyStart); $historyEvents = [$event('historical-only', $historyStart)]; $historicalBuckets = Engine::buckets($historyEvents, Engine::sessions($historyEvents, $site));
    $namespace = Store::uuid(); $tables = ['stats_hourly' => [['hour' => $historyHour, 'complete' => true, 'data' => $historicalBuckets[$historyHour]]], 'visitor_first_seen' => []]; $manifest = ['id' => Store::uuid(), 'site_id' => 'analysis', 'namespace' => $namespace, 'status' => 'published', 'created_at' => Store::now(), 'tables' => $tables, 'sha256' => hash('sha256', json_encode($tables, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION)), 'site_snapshot' => $site + ['first_seen_history_complete' => true]]; $app->store->put('history_namespaces', $namespace, $manifest, 'analysis');
    $historyRange = ['from' => $historyHour, 'to' => Engine::iso($historyStart + 3600000)]; $isolated = $request('GET', 'stats', [], $historyRange + ['namespace' => $namespace]);
    $equal($isolated['totals']['pv'], 1, 'explicit history namespace reads actual persisted hour'); $equal($isolated['storage']['source'], 'mysql_history_namespace', 'history source observable'); $equal($request('GET', 'stats', [], $historyRange)['totals']['pv'], 0, 'history snapshot does not alter active statistics');
    $manifest['tables']['stats_hourly'][0]['data']['pv'] = 500; $app->store->put('history_namespaces', $namespace, $manifest, 'analysis'); try { $request('GET', 'stats', [], $historyRange + ['namespace' => $namespace]); $assert(false, 'tampered history refused'); } catch (HttpError $e) { $equal($e->errorCode, 'history_integrity_invalid', 'history hash checked before analysis'); }
    $request('PATCH', 'experiments/' . $experiment['id'], ['enabled' => false]); $equal($request('GET', 'experiments')[0]['enabled'], false, 'experiment enabled change');
    $row = ['id' => 'partial-frame', 'site_id' => 'analysis', 'type' => 'visitor', 'visitor_id' => $visitor, 'started_at' => Engine::iso($at), 'ended_at' => Engine::iso($at + 10), 'created_at' => Store::now()]; Governance::appendJournal($app->config, [$row]);
    $replay = $request('GET', 'replay'); $equal($replay[0]['event_count'], 1, 'temporal deletion removes frame inside interval'); $assert($app->store->get('privacy_applied', $row['id']) !== null, 'analytics read repairs durable deletion journal before derived reads'); $equal($replay[0]['payload'][0]['timestamp'], $at - 500, 'replay keeps frame before precise deletion start');
    $equal(array_sum(array_column($request('GET', 'experiments'), 'conversions')), 0, 'experiment deleted contribution filtered');
    $deletedStats = $request('GET', 'stats', [], $range); $equal($deletedStats['totals']['pv'], 1, 'tombstone filters stats before physical deletion');
    $equal($request('GET', 'identities', [], $range)['signupCount'], 0, 'deleted identity segment not resurrected');
    $other = $site; $other['id'] = 'other'; $app->store->put('sites', 'other', $other, 'other'); $foreign = Store::uuid(); $app->store->put('goals', $foreign, ['id' => $foreign, 'site_id' => 'other', 'name' => 'foreign', 'type' => 'page', 'config' => ['path' => '/']], 'other'); try { $request('DELETE', 'goals/' . $foreign); $assert(false, 'cross-site definition rejected'); } catch (HttpError $e) { $equal($e->status, 404, 'cross-site definition ownership'); }
    echo 'analytics: ' . $checks . ' assertions passed; ' . $server->query('SELECT VERSION()')->fetchColumn() . PHP_EOL;
} finally {
    $server->exec("DROP DATABASE `$name`"); $remove = function(string $path) use (&$remove): void { if (is_dir($path)) { foreach (scandir($path) ?: [] as $f) if ($f !== '.' && $f !== '..') $remove($path . '/' . $f); rmdir($path); } elseif (is_file($path)) unlink($path); }; $remove($directory);
}
