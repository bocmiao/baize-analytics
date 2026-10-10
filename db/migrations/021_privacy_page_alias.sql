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
UPDATE aggregation_state a SET generation=generation+1,processed_generation=0,epoch=gen_random_uuid(),lease_owner=NULL,lease_until=NULL,watermark=NULL,attempts=0,last_error=NULL,dead_letter_at=NULL
 FROM sites s WHERE s.id=a.site_id AND s.privacy_mode='daily_salt';
UPDATE sites SET config=config||jsonb_build_object('privacy_cleanup_version',2) WHERE privacy_mode='daily_salt';
