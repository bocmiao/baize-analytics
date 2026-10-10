-- CH derived effect/vital bodies. PG retains exact publication receipts only.
CREATE UNIQUE INDEX analytics_fact_store_run_owner ON analytics_fact_runs(id,site_id);
CREATE TABLE analytics_fact_store_runs (
 run_id uuid NOT NULL REFERENCES analytics_fact_runs(id) ON DELETE CASCADE,
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('effects','vitals')),
 state text NOT NULL CHECK(state IN ('staging','complete')),
 aggregation_epoch uuid NOT NULL,
 source_aggregation_epoch uuid NOT NULL,
 canonical_epoch uuid,
 deletion_epoch bigint,
 PRIMARY KEY(run_id,kind),
 UNIQUE(run_id,kind,site_id),
 FOREIGN KEY(run_id,site_id) REFERENCES analytics_fact_runs(id,site_id) ON DELETE CASCADE
);
CREATE TABLE analytics_fact_store_batches (
 id uuid PRIMARY KEY,
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 run_id uuid NOT NULL REFERENCES analytics_fact_runs(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('effects','vitals')),
 attempt_id uuid NOT NULL UNIQUE,
 aggregation_epoch uuid NOT NULL,
 source_aggregation_epoch uuid NOT NULL,
 canonical_epoch uuid,
 deletion_epoch bigint,
 row_count integer NOT NULL CHECK(row_count BETWEEN 0 AND 100),
 checksum text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,run_id,kind),
 FOREIGN KEY(run_id,kind,site_id) REFERENCES analytics_fact_store_runs(run_id,kind,site_id) ON DELETE CASCADE
);
CREATE INDEX analytics_fact_store_batch_run ON analytics_fact_store_batches(site_id,run_id,kind,id);
CREATE TABLE analytics_fact_store_members (
 run_id uuid NOT NULL REFERENCES analytics_fact_runs(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('effects','vitals')),
 row_key text NOT NULL,
 batch_id uuid NOT NULL,
 body_hash text NOT NULL,
 visitor_id text NOT NULL,
 event_ts timestamptz NOT NULL,
 session_id uuid NOT NULL,
 event_id uuid NOT NULL,
 PRIMARY KEY(run_id,kind,row_key),
 FOREIGN KEY(batch_id,run_id,kind) REFERENCES analytics_fact_store_batches(id,run_id,kind) ON DELETE CASCADE
);
CREATE INDEX analytics_fact_store_identity ON analytics_fact_store_members(visitor_id,event_ts,run_id);

CREATE TABLE analytics_fact_store_gc (
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 site_id text PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
 next_attempt_id uuid,
 last_success_at timestamptz,
 last_error_code text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
