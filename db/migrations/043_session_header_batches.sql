-- Durable event topology belongs to ClickHouse; PostgreSQL stores publication
-- receipts and exact identity/time scope only. Uncommitted uploads are invisible.
CREATE TABLE analytics_header_batches (
 id uuid PRIMARY KEY,
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 run_id uuid NOT NULL REFERENCES analytics_fact_runs(id) ON DELETE CASCADE,
 attempt_id uuid NOT NULL UNIQUE,
 aggregation_epoch uuid NOT NULL,
 canonical_epoch uuid,
 deletion_epoch bigint,
 row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 200),
 checksum text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_header_batches_run ON analytics_header_batches(site_id,run_id,id);
CREATE TABLE analytics_header_members (
 run_id uuid NOT NULL REFERENCES analytics_fact_runs(id) ON DELETE CASCADE,
 event_id uuid NOT NULL,
 batch_id uuid NOT NULL REFERENCES analytics_header_batches(id) ON DELETE CASCADE,
 body_hash text NOT NULL,
 visitor_id text NOT NULL,
 event_ts timestamptz NOT NULL,
 session_id uuid NOT NULL,
 PRIMARY KEY(run_id,event_id)
);
CREATE INDEX analytics_header_members_identity ON analytics_header_members(visitor_id,event_ts,run_id);

-- Explicit producer completion includes legitimately empty topology projections.
-- Absence of rows or source_events=0 is never a completion certificate.
CREATE TABLE analytics_header_runs (
 run_id uuid PRIMARY KEY REFERENCES analytics_fact_runs(id) ON DELETE CASCADE,
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 state text NOT NULL CHECK(state IN('complete')),
 aggregation_epoch uuid NOT NULL,
 canonical_epoch uuid,
 deletion_epoch bigint,
 row_count bigint NOT NULL CHECK(row_count>=0)
);
