<?php
declare(strict_types=1);
namespace Baize;

/** Stateless, read-only MCP Streamable HTTP scoped to one authorized site. */
final class Mcp
{
    public const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];

    private static function authorize(App $app, Http $request): void
    {
        $url = parse_url($app->config['public_url']);
        $scheme = strtolower($url['scheme'] ?? 'https'); $port = $url['port'] ?? null;
        $origin = $scheme . '://' . ($url['host'] ?? '') . ($port !== null && !(($scheme === 'https' && $port === 443) || ($scheme === 'http' && $port === 80)) ? ':' . $port : '');
        if ($request->header('origin') !== null && !hash_equals($origin, $request->header('origin'))) Http::error(403, 'mcp_origin_denied', 'Invalid request origin');
        $app->auth->authorize($request, $request->params['siteId'], 'read');
    }
    private static function error(string|int|float|null $id, int $code, string $message, int $status = 200): array
    {
        http_response_code($status);
        return ['jsonrpc' => '2.0', 'id' => $id, 'error' => ['code' => $code, 'message' => $message]];
    }
    public static function tool(): array
    {
        return [
            'name' => 'query_analytics',
            'description' => 'Read-only aggregates for the authorized site and requested calendar range. No SQL, raw events, identities or other sites.',
            'inputSchema' => [
                'type' => 'object', 'additionalProperties' => false,
                'properties' => [
                    'metric' => ['type' => 'string', 'enum' => ['pv', 'uv', 'sessions', 'conversions', 'conversion_rate']],
                    'dimension' => ['type' => 'string', 'enum' => ['day', 'page', 'source', 'device'], 'default' => 'day'],
                    'start' => ['type' => 'string', 'format' => 'date'], 'end' => ['type' => 'string', 'format' => 'date'],
                    'limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 100, 'default' => 30],
                    'filters' => ['type' => 'object', 'additionalProperties' => false, 'properties' => [
                        'source' => ['type' => 'string', 'maxLength' => 200], 'device' => ['type' => 'string', 'maxLength' => 100],
                        'os' => ['type' => 'string', 'maxLength' => 100], 'page' => ['type' => 'string', 'maxLength' => 500],
                    ]],
                ], 'required' => ['metric', 'start', 'end'],
            ],
            'annotations' => ['title' => 'Authorized site aggregate analytics', 'readOnlyHint' => true, 'destructiveHint' => false, 'idempotentHint' => true, 'openWorldHint' => false],
        ];
    }
    private static function arguments(mixed $arguments): ?array
    {
        if (!$arguments instanceof \stdClass) return null;
        $query = get_object_vars($arguments);
        if (array_diff(array_keys($query), ['metric', 'dimension', 'start', 'end', 'limit', 'filters']) || !in_array($query['metric'] ?? null, ['pv', 'uv', 'sessions', 'conversions', 'conversion_rate'], true) || !in_array($query['dimension'] ?? 'day', ['day', 'page', 'source', 'device'], true)) return null;
        foreach (['start', 'end'] as $key) {
            if (!is_string($query[$key] ?? null) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $query[$key])) return null;
            $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $query[$key], new \DateTimeZone('UTC'));
            if (!$date || $date->format('Y-m-d') !== $query[$key]) return null;
        }
        if ($query['start'] > $query['end'] || (new \DateTimeImmutable($query['start']))->diff(new \DateTimeImmutable($query['end']))->days > 30) return null;
        $limit = $query['limit'] ?? 30;
        if ((!is_int($limit) && !(is_float($limit) && is_finite($limit) && floor($limit) === $limit)) || $limit < 1 || $limit > 100) return null;
        $query['limit'] = (int)$limit; $query['dimension'] ??= 'day';
        if (array_key_exists('filters', $query)) {
            if (!$query['filters'] instanceof \stdClass) return null;
            $filters = get_object_vars($query['filters']); $limits = ['source' => 200, 'device' => 100, 'os' => 100, 'page' => 500];
            if (array_diff(array_keys($filters), array_keys($limits))) return null;
            foreach ($filters as $key => $value) if (!is_string($value) || mb_strlen($value, 'UTF-8') > $limits[$key]) return null;
            $query['filters'] = $filters;
        }
        return $query;
    }
    public static function handle(App $app, Http $request): ?array
    {
        header('Cache-Control: no-store'); self::authorize($app, $request);
        try { $body = json_decode($request->rawBody, false, 64, JSON_THROW_ON_ERROR); }
        catch (\JsonException) { return self::error(null, -32700, 'Parse error', 400); }
        if (!$body instanceof \stdClass) return self::error(null, -32600, 'Invalid JSON-RPC request', 400);
        $message = get_object_vars($body);
        $hasId = array_key_exists('id', $message); $id = $message['id'] ?? null;
        if (array_diff(array_keys($message), ['jsonrpc', 'id', 'method', 'params']) || ($message['jsonrpc'] ?? null) !== '2.0' || !is_string($message['method'] ?? null) || $message['method'] === '' || $hasId && (!is_string($id) && !is_int($id) && !(is_float($id) && is_finite($id))) || array_key_exists('params', $message) && !$message['params'] instanceof \stdClass) return self::error(null, -32600, 'Invalid JSON-RPC request', 400);
        $version = $request->header('mcp-protocol-version');
        if ($version !== null && !in_array($version, self::VERSIONS, true)) return self::error($id, -32600, 'Unsupported MCP protocol version', 400);
        if (!$hasId) { http_response_code(202); return null; }
        $params = isset($message['params']) ? get_object_vars($message['params']) : [];
        if ($message['method'] === 'initialize') {
            $client = $params['clientInfo'] ?? null;
            if (!is_string($params['protocolVersion'] ?? null) || !(($params['capabilities'] ?? null) instanceof \stdClass) || !$client instanceof \stdClass || !is_string($client->name ?? null) || $client->name === '' || !is_string($client->version ?? null)) return self::error($id, -32602, 'Invalid initialize parameters');
            return ['jsonrpc' => '2.0', 'id' => $id, 'result' => ['protocolVersion' => in_array($params['protocolVersion'], self::VERSIONS, true) ? $params['protocolVersion'] : self::VERSIONS[0], 'capabilities' => ['tools' => ['listChanged' => false]], 'serverInfo' => ['name' => 'baize-analytics', 'version' => '0.1.0'], 'instructions' => 'Read-only site-scoped aggregates. No raw events, SQL, identity lookup, model calls or mutation. Calendar dates are inclusive; maximum31 days and100 groups.']];
        }
        if ($message['method'] === 'ping') return ['jsonrpc' => '2.0', 'id' => $id, 'result' => (object)[]];
        if ($message['method'] === 'tools/list') return ['jsonrpc' => '2.0', 'id' => $id, 'result' => ['tools' => [self::tool()]]];
        if ($message['method'] !== 'tools/call') return self::error($id, -32601, 'Method not found');
        $query = self::arguments($params['arguments'] ?? null);
        if (array_diff(array_keys($params), ['name', 'arguments']) || ($params['name'] ?? null) !== 'query_analytics' || $query === null) return self::error($id, -32602, 'Unknown tool or invalid arguments');
        self::authorize($app, $request);
        try { $result = External::semantic($app, $request->params['siteId'], $query, ['start' => $query['start'], 'end' => $query['end']]); }
        catch (HttpError $error) {
            self::authorize($app, $request);
            return ['jsonrpc' => '2.0', 'id' => $id, 'result' => ['isError' => true, 'content' => [['type' => 'text', 'text' => json_encode(['error' => $error->errorCode, 'message' => $error->getMessage()], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE)]]]];
        }
        self::authorize($app, $request);
        return ['jsonrpc' => '2.0', 'id' => $id, 'result' => ['content' => [['type' => 'text', 'text' => json_encode($result, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]], 'structuredContent' => $result]];
    }
    public static function register(App $app, Router $router): void
    {
        $path = '/api/sites/:siteId/mcp';
        foreach (['GET', 'DELETE'] as $method) $router->add($method, $path, function(Http $request) use ($app): array { self::authorize($app, $request); return Http::json(['error' => 'mcp_method_not_allowed'], 405, ['Allow' => 'POST']); });
        $router->add('POST', $path, fn(Http $request): ?array => self::handle($app, $request));
    }
}
