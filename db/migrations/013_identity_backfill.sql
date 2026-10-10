-- Recover event-time identity history retained by pre-episode installations.
-- A projection's ingestion timestamp is not an identity transition when identify events exist.
DELETE FROM identity_bindings b USING identity_map m
 WHERE b.site_id=m.site_id AND b.visitor_id=m.visitor_id AND b.started_at=m.created_at
 AND EXISTS(SELECT 1 FROM events e WHERE e.site_id=b.site_id AND e.visitor_id=b.visitor_id AND e.type='identify' AND jsonb_typeof(e.payload->'user_id')='string')
 AND NOT EXISTS(SELECT 1 FROM events e WHERE e.site_id=b.site_id AND e.visitor_id=b.visitor_id AND e.type='identify' AND e.ts=b.started_at AND e.payload->>'user_id'=b.user_id);
INSERT INTO identity_bindings(site_id,visitor_id,user_id,started_at)
 SELECT DISTINCT ON(e.site_id,e.visitor_id,e.ts) e.site_id,e.visitor_id,e.payload->>'user_id',e.ts
 FROM events e JOIN sites s ON s.id=e.site_id
 WHERE e.type='identify' AND s.privacy_mode='standard' AND jsonb_typeof(e.payload->'user_id')='string'
 AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=e.site_id AND (t.visitor_id=e.visitor_id OR t.user_id=e.payload->>'user_id'))
 AND NOT EXISTS(SELECT 1 FROM identity_tombstones t WHERE t.site_id=e.site_id AND t.visitor_id=e.visitor_id AND e.ts>=t.started_at AND e.ts<t.ended_at)
 ORDER BY e.site_id,e.visitor_id,e.ts,e.event_id
 ON CONFLICT(site_id,visitor_id,started_at) DO NOTHING;
WITH bounds AS(
 SELECT b.site_id,b.visitor_id,b.started_at,
 lead(b.started_at) OVER(PARTITION BY b.site_id,b.visitor_id ORDER BY b.started_at) AS next_at,
 (SELECT min(t.started_at) FROM identity_tombstones t WHERE t.site_id=b.site_id AND t.visitor_id=b.visitor_id AND t.started_at>b.started_at) AS deleted_at
 FROM identity_bindings b
) UPDATE identity_bindings b SET ended_at=LEAST(b.ended_at,x.next_at,x.deleted_at)
 FROM bounds x WHERE b.site_id=x.site_id AND b.visitor_id=x.visitor_id AND b.started_at=x.started_at;
UPDATE events e SET payload=jsonb_set(e.payload,'{user_id}',to_jsonb(b.user_id),true)
 FROM identity_bindings b WHERE e.site_id=b.site_id AND e.visitor_id=b.visitor_id AND e.ts>=b.started_at AND (b.ended_at IS NULL OR e.ts<b.ended_at);
