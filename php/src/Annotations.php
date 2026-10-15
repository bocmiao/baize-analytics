<?php
declare(strict_types=1);
namespace Baize;

/** Manual calendar notes are never tracker events, model input or measured evidence. */
final class Annotations
{
    private static function date(mixed $value): string
    {
        if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)) Http::error(400, 'annotation_date_invalid', '请填写有效的日历日期');
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $value, new \DateTimeZone('UTC'));
        if (!$date || $date->format('Y-m-d') !== $value) Http::error(400, 'annotation_date_invalid', '请填写有效的日历日期');
        return $value;
    }
    private static function utf16Length(string $value): int
    {
        $encoded = iconv('UTF-8', 'UTF-16LE', $value);
        if ($encoded === false) Http::error(400, 'annotation_text_invalid', '标题需为1–120个字符，备注最多2000个字符');
        return intdiv(strlen($encoded), 2);
    }
    private static function body(array $body): array
    {
        if (array_diff(array_keys($body), ['date', 'title', 'note'])) Http::error(400, 'annotation_body_invalid', '备注只接受日期、标题和正文');
        $date = self::date($body['date'] ?? null);
        if (!is_string($body['title'] ?? null) || array_key_exists('note', $body) && !is_string($body['note'])) Http::error(400, 'annotation_text_invalid', '标题需为1–120个字符，备注最多2000个字符');
        $title = preg_replace('/^\s+|\s+$/u', '', $body['title']); $note = $body['note'] ?? '';
        if ($title === null || $title === '' || self::utf16Length($title) > 120 || self::utf16Length($note) > 2000) Http::error(400, 'annotation_text_invalid', '标题需为1–120个字符，备注最多2000个字符');
        return compact('date', 'title', 'note');
    }
    private static function id(string $id): string
    {
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iD', $id)) Http::error(400, 'annotation_id_invalid', '备注标识无效，请重新加载列表');
        return $id;
    }
    public static function register(App $app, Router $router): void
    {
        $base = '/api/v1/sites/:siteId/annotations';
        $router->add('GET', $base, function(Http $request) use ($app): array {
            $siteId = $request->params['siteId']; $app->auth->authorize($request, $siteId);
            if (array_diff(array_keys($request->query), ['from', 'to'])) Http::error(400, 'annotation_window_invalid', '查询范围最多366天，开始日期不能晚于结束日期');
            $from = self::date($request->query['from'] ?? null); $to = self::date($request->query['to'] ?? null);
            if ($from > $to || (new \DateTimeImmutable($from))->diff(new \DateTimeImmutable($to))->days > 365) Http::error(400, 'annotation_window_invalid', '查询范围最多366天，开始日期不能晚于结束日期');
            return $app->db->transaction(function() use ($app, $request, $siteId, $from, $to): array {
                $app->db->lock('site:' . $siteId); $app->auth->authorize($request, $siteId);
                $rows = $app->db->all("SELECT body FROM documents WHERE kind=? AND site_id=? AND JSON_UNQUOTE(JSON_EXTRACT(body,'$.date')) BETWEEN ? AND ? ORDER BY JSON_UNQUOTE(JSON_EXTRACT(body,'$.date')),id LIMIT 201", ['annotations', $siteId, $from, $to]);
                $visible = [];
                foreach (array_slice($rows, 0, 200) as $row) $visible[] = array_intersect_key(json_decode($row['body'], true, 512, JSON_THROW_ON_ERROR), array_flip(['id', 'date', 'timezone', 'title', 'note', 'created_at', 'updated_at']));
                return ['rows' => $visible, 'truncated' => count($rows) > 200, 'currentTimezone' => $app->store->get('sites', $siteId)['timezone'] ?? 'UTC', 'timezoneSemantics' => 'per_note_write_time_snapshot', 'origin' => 'manual_note', 'measuredEvidence' => false, 'causalEvidence' => false];
            });
        });
        foreach (['POST', 'PATCH'] as $method) $router->add($method, $base . ($method === 'PATCH' ? '/:id' : ''), function(Http $request) use ($app, $method): array {
            $siteId = $request->params['siteId']; $app->auth->authorize($request, $siteId, 'write');
            $body = self::body($request->body); $id = $method === 'POST' ? Store::uuid() : self::id($request->params['id']);
            return $app->db->transaction(function() use ($app, $request, $method, $siteId, $body, $id): array {
                $app->db->lock('site:' . $siteId); $user = $app->auth->authorize($request, $siteId, 'write');
                $timezone = $app->store->get('sites', $siteId)['timezone'] ?? 'UTC';
                try { new \DateTimeZone($timezone); } catch (\Throwable) { Http::error(409, 'site_timezone_invalid', '站点时区无效，请在站点设置中修正后重试'); }
                $existing = $method === 'PATCH' ? $app->store->get('annotations', $id) : null;
                if ($method === 'PATCH' && (!$existing || ($existing['site_id'] ?? null) !== $siteId)) Http::error(404, 'annotation_missing', '备注不存在，请重新加载列表');
                $now = Store::now(); $note = array_replace($existing ?? ['id' => $id, 'site_id' => $siteId, 'created_by' => $user['id'], 'created_at' => $now], $body, ['timezone' => $timezone, 'updated_at' => $now]);
                $app->store->put('annotations', $id, $note, $siteId);
                $app->audit($user['id'], $siteId, $method === 'POST' ? 'annotation.create' : 'annotation.update', ['id' => $id, 'date' => $body['date']]);
                return ['id' => $id, 'origin' => 'manual_note', 'measuredEvidence' => false];
            });
        });
        $router->add('DELETE', $base . '/:id', function(Http $request) use ($app): array {
            $siteId = $request->params['siteId']; $app->auth->authorize($request, $siteId, 'write'); $id = self::id($request->params['id']);
            return $app->db->transaction(function() use ($app, $request, $siteId, $id): array {
                $app->db->lock('site:' . $siteId); $user = $app->auth->authorize($request, $siteId, 'write');
                $note = $app->store->get('annotations', $id); if (!$note || ($note['site_id'] ?? null) !== $siteId) Http::error(404, 'annotation_missing', '备注不存在，请重新加载列表');
                $app->store->delete('annotations', $id); $app->audit($user['id'], $siteId, 'annotation.delete', ['id' => $id]);
                return ['ok' => true];
            });
        });
    }
}
