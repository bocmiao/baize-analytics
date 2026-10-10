-- Forward archive repair; never edit released 020/021 checksums.
-- Forward repair: page_id props must not retain caller stable IDs; preserve protocol day-scoped column.
-- Forward repair for daily-salt direct collector aliases, matching MIT privacy.ts.
INSERT INTO export_file_cleanup(site_id,job_id,filenames,status,next_at)
 SELECT j.site_id,j.id,
 CASE WHEN substring(j.path FROM '([^/]+)$') ~* ('^'||j.id::text||'\.(json|csv)(\.tmp[-.][a-z0-9-]+)?$')
 THEN jsonb_build_array(substring(j.path FROM '([^/]+)$')) ELSE '[]'::jsonb END,'pending',now()
 FROM export_jobs j JOIN sites s ON s.id=j.site_id WHERE s.privacy_mode='daily_salt'
 ON CONFLICT(job_id) DO UPDATE SET filenames=(SELECT coalesce(jsonb_agg(DISTINCT value),'[]'::jsonb) FROM jsonb_array_elements(export_file_cleanup.filenames||excluded.filenames)),status='pending',next_at=now(),completed_at=NULL;
UPDATE export_jobs j SET status='revoked',path=NULL,lease_until=NULL
 FROM sites s WHERE s.id=j.site_id AND s.privacy_mode='daily_salt';

WITH scrubbed AS(
 SELECT e.site_id,e.event_id,e.ts,coalesce(jsonb_object_agg(p.key,p.value) FILTER(WHERE
 NOT(regexp_replace(p.key,'[^a-z0-9]','','gi') ~* '^(uid|uuid|idfa|gaid|advertisingid|identity|identification|fingerprint|email|emailaddress|mail|phone|phonenumber|mobile|telephone|username|fullname|firstname|lastname|address|ip|ipaddress|cookie|authorization|token|accesstoken|ssn|contact|identifier|customer|device|userid)$|^(page|user|visitor|distinct|device|session|account|customer|external|anonymous|client|person|profile|member|contact|login).*(id|identifier)$')
 AND NOT(jsonb_typeof(p.value)='string' AND trim(both '"' FROM p.value::text) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
 ),'{}'::jsonb) AS props
 FROM events e JOIN sites s ON s.id=e.site_id
 LEFT JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(e.payload->'props')='object' THEN e.payload->'props' ELSE '{}'::jsonb END) p ON true
 WHERE s.privacy_mode='daily_salt' GROUP BY e.site_id,e.event_id,e.ts
) UPDATE events e SET payload=jsonb_set(e.payload,'{props}',x.props,true)
 FROM scrubbed x WHERE e.site_id=x.site_id AND e.event_id=x.event_id AND e.ts=x.ts;
DELETE FROM event_data d USING sites s WHERE s.id=d.site_id AND s.privacy_mode='daily_salt'
 AND (regexp_replace(d.data_key,'[^a-z0-9]','','gi') ~* '^(uid|uuid|idfa|gaid|advertisingid|identity|identification|fingerprint|email|emailaddress|mail|phone|phonenumber|mobile|telephone|username|fullname|firstname|lastname|address|ip|ipaddress|cookie|authorization|token|accesstoken|ssn|contact|identifier|customer|device|userid)$|^(page|user|visitor|distinct|device|session|account|customer|external|anonymous|client|person|profile|member|contact|login).*(id|identifier)$'
 OR d.string_value ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');

-- Retained archives outlive raw events: scrub property names AND email-shaped grouped values.
-- Keep safe historical counters; deleting all archives would silently discard unreconstructable metrics.
CREATE FUNCTION pg_temp.baize_private_bucket(bucket jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $body$
 SELECT jsonb_set(bucket,'{events}',coalesce((SELECT jsonb_object_agg(ev.key,
  CASE WHEN jsonb_typeof(ev.value)='object' THEN jsonb_set(ev.value,'{properties}',coalesce((
   SELECT jsonb_object_agg(prop.key,coalesce((SELECT jsonb_object_agg(val.key,val.value)
    FROM jsonb_each(CASE WHEN jsonb_typeof(prop.value)='object' THEN prop.value ELSE '{}'::jsonb END) val
    WHERE val.key !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),'{}'::jsonb))
   FROM jsonb_each(CASE WHEN jsonb_typeof(ev.value->'properties')='object' THEN ev.value->'properties' ELSE '{}'::jsonb END) prop
   WHERE regexp_replace(prop.key,'[^a-z0-9]','','gi') !~* '^(uid|uuid|idfa|gaid|advertisingid|identity|identification|fingerprint|email|emailaddress|mail|phone|phonenumber|mobile|telephone|username|fullname|firstname|lastname|address|ip|ipaddress|cookie|authorization|token|accesstoken|ssn|contact|identifier|customer|device|userid)$|^(page|user|visitor|distinct|device|session|account|customer|external|anonymous|client|person|profile|member|contact|login).*(id|identifier)$'
   AND EXISTS(SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(prop.value)='object' THEN prop.value ELSE '{}'::jsonb END) val
    WHERE val.key !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
  ),'{}'::jsonb),true) ELSE '{}'::jsonb END)
 FROM jsonb_each(CASE WHEN jsonb_typeof(bucket->'events')='object' THEN bucket->'events' ELSE '{}'::jsonb END) ev),'{}'::jsonb),true);
$body$;
UPDATE stats_hourly h SET data=pg_temp.baize_private_bucket(h.data) FROM sites s WHERE h.site_id=s.id AND s.privacy_mode='daily_salt';
UPDATE stats_daily d SET data=pg_temp.baize_private_bucket(d.data) FROM sites s WHERE d.site_id=s.id AND s.privacy_mode='daily_salt';
DROP FUNCTION pg_temp.baize_private_bucket(jsonb);
UPDATE aggregation_state a SET generation=generation+1,processed_generation=0,epoch=gen_random_uuid(),lease_owner=NULL,lease_until=NULL,watermark=NULL,attempts=0,last_error=NULL,dead_letter_at=NULL
 FROM sites s WHERE s.id=a.site_id AND s.privacy_mode='daily_salt';
UPDATE sites SET config=config||jsonb_build_object('privacy_cleanup_version',4) WHERE privacy_mode='daily_salt';
