-- Operational monotonic expiry authorization; not a personal deletion journal.
CREATE TABLE replay_retention_jobs (
 site_id text PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
 cutoff timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0,
 next_at timestamptz NOT NULL DEFAULT now(),
 last_error text,
 completed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
