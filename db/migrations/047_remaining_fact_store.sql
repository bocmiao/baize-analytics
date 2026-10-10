-- Receipt-only durable derived bodies; no source fact JSON is stored here.
CREATE TABLE analytics_remaining_fact_runs (
 run_id uuid NOT NULL,
 site_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN('sessions','numerics','members','carry_checkpoints','carry_keys')),
 state text NOT NULL CHECK(state IN('staging','complete')),
 aggregation_epoch uuid NOT NULL,
 source_aggregation_epoch uuid NOT NULL,
 canonical_epoch uuid,
 deletion_epoch bigint,
 PRIMARY KEY(run_id,kind),
 UNIQUE(run_id,kind,site_id),
 FOREIGN KEY(run_id,site_id) REFERENCES analytics_fact_runs(id,site_id) ON DELETE CASCADE
);
CREATE TABLE analytics_remaining_fact_batches (
 id uuid PRIMARY KEY,
 run_id uuid NOT NULL,
 site_id text NOT NULL,
 kind text NOT NULL,
 attempt_id uuid NOT NULL UNIQUE,
 aggregation_epoch uuid NOT NULL,
 source_aggregation_epoch uuid NOT NULL,
 canonical_epoch uuid,
 deletion_epoch bigint,
 row_count integer NOT NULL CHECK(row_count BETWEEN 0 AND 100),
 checksum text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,run_id,kind),
 FOREIGN KEY(run_id,kind,site_id) REFERENCES analytics_remaining_fact_runs(run_id,kind,site_id) ON DELETE CASCADE
);
CREATE INDEX analytics_remaining_fact_batch_run ON analytics_remaining_fact_batches(site_id,run_id,kind,id);
CREATE TABLE analytics_remaining_fact_members (
 run_id uuid NOT NULL,
 kind text NOT NULL,
 row_key text NOT NULL,
 batch_id uuid NOT NULL,
 body_hash text NOT NULL,
 visitor_id text NOT NULL,
 session_id uuid NOT NULL,
 interval_from timestamptz NOT NULL,
 interval_to timestamptz NOT NULL,
 anchor_event_id uuid,
 last_event_id uuid,
 anchor_ts timestamptz,
 anchor_page_id uuid,
 orphan boolean,
 PRIMARY KEY(run_id,kind,row_key),
 FOREIGN KEY(batch_id,run_id,kind) REFERENCES analytics_remaining_fact_batches(id,run_id,kind) ON DELETE CASCADE,
 CHECK(interval_from<=interval_to)
);
CREATE INDEX analytics_remaining_fact_identity ON analytics_remaining_fact_members(visitor_id,interval_from,interval_to,run_id);
CREATE TABLE analytics_remaining_fact_gc (
 site_id text PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
 next_attempt_id uuid,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 last_success_at timestamptz,
 last_error_code text,
 updated_at timestamptz NOT NULL DEFAULT now()
);

-- Preserve authenticated carry lineage when PG checkpoint bodies are pruned.
ALTER TABLE canonical_carry_provenance DROP CONSTRAINT canonical_carry_provenance_run_id_visitor_id_fkey;
ALTER TABLE canonical_carry_provenance ADD CONSTRAINT canonical_carry_provenance_run_id_fkey FOREIGN KEY(run_id) REFERENCES analytics_fact_runs(id) ON DELETE CASCADE;
-- Published carry ownership outlives its PG body after receipt-backed pruning.
ALTER TABLE analytics_carry_heads DROP CONSTRAINT analytics_carry_heads_run_id_visitor_id_fkey;
ALTER TABLE analytics_carry_heads ADD CONSTRAINT analytics_carry_heads_run_id_fkey FOREIGN KEY(run_id) REFERENCES analytics_fact_runs(id) ON DELETE CASCADE;
-- Explicit body cutover gate; authority/read preference alone never enables pruning.
ALTER TABLE canonical_event_authority ADD COLUMN body_mode text NOT NULL DEFAULT 'transition' CHECK(body_mode IN('transition','strict'));
