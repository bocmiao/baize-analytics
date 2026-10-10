-- Opt-in staging only until worker publication/deletion/restore integration is validated.
CREATE TABLE analytics_fact_runs (
 id uuid PRIMARY KEY,site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 epoch uuid NOT NULL,generation bigint NOT NULL,outbox_high_watermark bigint NOT NULL,
 status text NOT NULL CHECK(status IN ('staging','ready','published','obsolete')),
 created_at timestamptz NOT NULL DEFAULT now(),
 source_watermark timestamptz,source_events bigint NOT NULL DEFAULT 0,
 source_authority text NOT NULL DEFAULT 'postgres' CHECK(source_authority IN ('postgres','clickhouse')),
 canonical_epoch uuid,canonical_deletion_epoch bigint,
 CHECK(source_authority<>'clickhouse' OR(canonical_epoch IS NOT NULL AND canonical_deletion_epoch IS NOT NULL))
);
CREATE INDEX analytics_fact_runs_site ON analytics_fact_runs(site_id,status,created_at);
CREATE TABLE analytics_session_facts (
 run_id uuid NOT NULL REFERENCES analytics_fact_runs(id) ON DELETE CASCADE,
 session_id uuid NOT NULL,visitor_id text NOT NULL,data jsonb NOT NULL,
 PRIMARY KEY(run_id,session_id)
);
CREATE TABLE analytics_numeric_facts (
 run_id uuid NOT NULL REFERENCES analytics_fact_runs(id) ON DELETE CASCADE,
 bucket_kind text NOT NULL CHECK(bucket_kind IN ('hourly','daily')),bucket text NOT NULL,
 session_id uuid NOT NULL,metric text NOT NULL,key jsonb NOT NULL,value double precision NOT NULL,
 PRIMARY KEY(run_id,bucket_kind,bucket,session_id,metric,key)
);
CREATE TABLE analytics_member_facts (
 run_id uuid NOT NULL REFERENCES analytics_fact_runs(id) ON DELETE CASCADE,
 bucket_kind text NOT NULL CHECK(bucket_kind IN ('hourly','daily')),bucket text NOT NULL,
 session_id uuid NOT NULL,metric text NOT NULL,key jsonb NOT NULL,visitor_id text NOT NULL,
 PRIMARY KEY(run_id,bucket_kind,bucket,session_id,metric,key,visitor_id)
);
CREATE TABLE analytics_vitals_facts (
 run_id uuid NOT NULL REFERENCES analytics_fact_runs(id) ON DELETE CASCADE,
 bucket_kind text NOT NULL CHECK(bucket_kind IN ('hourly','daily')),bucket text NOT NULL,
 path text NOT NULL,metric text NOT NULL,digest jsonb NOT NULL,sample_count bigint NOT NULL,
 PRIMARY KEY(run_id,bucket_kind,bucket,path,metric)
);
