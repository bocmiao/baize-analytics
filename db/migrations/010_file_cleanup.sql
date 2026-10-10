CREATE TABLE IF NOT EXISTS export_file_cleanup (
 id bigserial PRIMARY KEY,site_id text NOT NULL,job_id uuid NOT NULL UNIQUE,
 filenames jsonb NOT NULL DEFAULT '[]',status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','complete')),
 attempts integer NOT NULL DEFAULT 0,next_at timestamptz NOT NULL DEFAULT now(),last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS export_cleanup_due ON export_file_cleanup(next_at) WHERE status='pending';
