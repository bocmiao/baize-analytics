-- Repair retained daily-salt data written before identity/day-isolated page enforcement.
-- Queue owned export cleanup before path removal so independent startup retries can unlink files.
INSERT INTO export_file_cleanup(site_id,job_id,filenames,status,next_at)
 SELECT j.site_id,j.id,
 CASE WHEN substring(j.path FROM '([^/]+)$') ~* ('^'||j.id::text||'\.(json|csv)(\.tmp[-.][a-z0-9-]+)?$')
 THEN jsonb_build_array(substring(j.path FROM '([^/]+)$')) ELSE '[]'::jsonb END,'pending',now()
 FROM export_jobs j JOIN sites s ON s.id=j.site_id WHERE s.privacy_mode='daily_salt'
 ON CONFLICT(job_id) DO UPDATE SET filenames=(SELECT coalesce(jsonb_agg(DISTINCT value),'[]'::jsonb) FROM jsonb_array_elements(export_file_cleanup.filenames||excluded.filenames)),status='pending',next_at=now(),completed_at=NULL;
UPDATE export_jobs j SET status='revoked',path=NULL,lease_until=NULL
 FROM sites s WHERE s.id=j.site_id AND s.privacy_mode='daily_salt';

-- Same source page ID on different local days must not survive as a cross-day join key.
UPDATE events e SET page_id=md5(s.salt_secret||':'||(e.ts AT TIME ZONE s.timezone)::date::text||':'||e.page_id::text)::uuid,
 payload=jsonb_set(e.payload-'user_id','{page_id}',to_jsonb(md5(s.salt_secret||':'||(e.ts AT TIME ZONE s.timezone)::date::text||':'||e.page_id::text)),true),
 dimensions=e.dimensions-'ip_truncated'
 FROM sites s WHERE s.id=e.site_id AND s.privacy_mode='daily_salt';
WITH scrubbed AS(
 SELECT e.site_id,e.event_id,e.ts,coalesce(jsonb_object_agg(p.key,p.value) FILTER(WHERE
 NOT(regexp_replace(p.key,'[^a-z0-9]','','gi') ~* '^(uid|uuid|idfa|gaid|advertisingid|identity|identification|fingerprint|email|emailaddress|mail|phone|phonenumber|mobile|telephone|username|fullname|firstname|lastname|address|ip|ipaddress|cookie|authorization|token|accesstoken|ssn)$|^(user|visitor|distinct|device|session|account|customer|external|anonymous|client|person|profile|member|contact|login).*(id|identifier)$')
 AND NOT(jsonb_typeof(p.value)='string' AND trim(both '"' FROM p.value::text) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
 ),'{}'::jsonb) AS props
 FROM events e JOIN sites s ON s.id=e.site_id
 LEFT JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(e.payload->'props')='object' THEN e.payload->'props' ELSE '{}'::jsonb END) p ON true
 WHERE s.privacy_mode='daily_salt' GROUP BY e.site_id,e.event_id,e.ts
) UPDATE events e SET payload=jsonb_set(e.payload,'{props}',x.props,true)
 FROM scrubbed x WHERE e.site_id=x.site_id AND e.event_id=x.event_id AND e.ts=x.ts;
DELETE FROM event_data d USING sites s WHERE s.id=d.site_id AND s.privacy_mode='daily_salt'
 AND (regexp_replace(d.data_key,'[^a-z0-9]','','gi') ~* '^(uid|uuid|idfa|gaid|advertisingid|identity|identification|fingerprint|email|emailaddress|mail|phone|phonenumber|mobile|telephone|username|fullname|firstname|lastname|address|ip|ipaddress|cookie|authorization|token|accesstoken|ssn)$|^(user|visitor|distinct|device|session|account|customer|external|anonymous|client|person|profile|member|contact|login).*(id|identifier)$'
 OR d.string_value ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
DELETE FROM identity_map m USING sites s WHERE s.id=m.site_id AND s.privacy_mode='daily_salt';
DELETE FROM identity_bindings b USING sites s WHERE s.id=b.site_id AND s.privacy_mode='daily_salt';
DELETE FROM visitor_first_seen v USING sites s WHERE s.id=v.site_id AND s.privacy_mode='daily_salt';
DELETE FROM sessions x USING sites s WHERE s.id=x.site_id AND s.privacy_mode='daily_salt';
DELETE FROM stats_hourly x USING sites s WHERE s.id=x.site_id AND s.privacy_mode='daily_salt';
DELETE FROM stats_daily x USING sites s WHERE s.id=x.site_id AND s.privacy_mode='daily_salt';
DELETE FROM page_vitals x USING sites s WHERE s.id=x.site_id AND s.privacy_mode='daily_salt';
DELETE FROM analytics_definitions x USING sites s WHERE s.id=x.site_id AND s.privacy_mode='daily_salt';
-- Legacy replay/heatmap cannot prove input masking or isolated identity provenance; discard rather than relabel.
DELETE FROM replay_chunks x USING sites s WHERE s.id=x.site_id AND s.privacy_mode='daily_salt';
DELETE FROM heatmap_points x USING sites s WHERE s.id=x.site_id AND s.privacy_mode='daily_salt';
DELETE FROM experiment_assignments a USING experiments e,sites s WHERE a.experiment_id=e.id AND e.site_id=s.id AND s.privacy_mode='daily_salt';
UPDATE aggregation_state a SET generation=generation+1,processed_generation=0,epoch=gen_random_uuid(),lease_owner=NULL,lease_until=NULL,watermark=NULL,attempts=0,last_error=NULL,dead_letter_at=NULL
 FROM sites s WHERE s.id=a.site_id AND s.privacy_mode='daily_salt';
UPDATE sites SET config=config||jsonb_build_object('privacy_cleanup_version',1) WHERE privacy_mode='daily_salt';
