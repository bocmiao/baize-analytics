-- Exact event-time contribution provenance. No canonical event payload is copied here.
ALTER TABLE analytics_fact_runs ADD COLUMN query_version smallint NOT NULL DEFAULT 1;
ALTER TABLE analytics_fact_runs ADD COLUMN retained_from timestamptz;
CREATE TABLE analytics_effect_facts (
 run_id uuid NOT NULL REFERENCES analytics_fact_runs(id) ON DELETE CASCADE,
 event_id uuid NOT NULL,event_ts timestamptz NOT NULL,session_id uuid NOT NULL,
 visitor_id text NOT NULL,event_path text NOT NULL,dimensions jsonb NOT NULL,
 metric text NOT NULL,key jsonb NOT NULL,value double precision NOT NULL,member boolean NOT NULL,
 PRIMARY KEY(run_id,event_id,session_id,metric,key,member)
);
CREATE INDEX analytics_effect_facts_time ON analytics_effect_facts(run_id,event_ts,metric);
CREATE TABLE analytics_vital_samples (
 run_id uuid NOT NULL REFERENCES analytics_fact_runs(id) ON DELETE CASCADE,
 event_id uuid NOT NULL,event_ts timestamptz NOT NULL,event_path text NOT NULL,
 dimensions jsonb NOT NULL,metric text NOT NULL,value double precision NOT NULL,
 PRIMARY KEY(run_id,event_id,metric)
);
CREATE INDEX analytics_vital_samples_time ON analytics_vital_samples(run_id,event_ts);
CREATE TABLE analytics_relational_buckets (
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,hour timestamptz NOT NULL,
 run_id uuid NOT NULL REFERENCES analytics_fact_runs(id) ON DELETE CASCADE,
 epoch uuid NOT NULL,generation bigint NOT NULL,
 PRIMARY KEY(site_id,hour)
);
CREATE INDEX analytics_relational_buckets_run ON analytics_relational_buckets(run_id,hour);

-- Compatibility numerics may be read without materializing historical identity arrays in Node.
CREATE FUNCTION analytics_bucket_without_members(value jsonb) RETURNS jsonb LANGUAGE SQL IMMUTABLE AS $$
 SELECT value || jsonb_build_object('visitors','[]'::jsonb,'activity','[]'::jsonb,'funnels',COALESCE((SELECT jsonb_object_agg(key,(SELECT COALESCE(jsonb_agg('[]'::jsonb),'[]'::jsonb) FROM jsonb_array_elements(val))) FROM jsonb_each(COALESCE(value->'funnels','{}')) AS p(key,val)),'{}'::jsonb),
 'pages',COALESCE((SELECT jsonb_object_agg(key,val||jsonb_build_object('visitors','[]'::jsonb)) FROM jsonb_each(COALESCE(value->'pages','{}')) AS p(key,val)),'{}'),
 'events',COALESCE((SELECT jsonb_object_agg(key,val||jsonb_build_object('visitors','[]'::jsonb)) FROM jsonb_each(COALESCE(value->'events','{}')) AS p(key,val)),'{}'),
 'segments',COALESCE((SELECT jsonb_object_agg(key,val||jsonb_build_object('visitors','[]'::jsonb)) FROM jsonb_each(COALESCE(value->'segments','{}')) AS p(key,val)),'{}'))
$$;
