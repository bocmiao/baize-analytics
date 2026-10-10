-- Durable bounded traversal: restarts must not keep scanning only the first
-- published runs and leave later uncommitted ClickHouse uploads forever.
CREATE TABLE analytics_header_gc (
 site_id text PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
 next_attempt_id uuid,
 last_success_at timestamptz,
 last_error_code text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
