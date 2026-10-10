ALTER TABLE external_jobs ADD COLUMN attempts integer NOT NULL DEFAULT 1,ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),ADD COLUMN lease_owner uuid,ADD COLUMN lease_until timestamptz,ADD COLUMN generation bigint NOT NULL DEFAULT 0;
CREATE INDEX external_job_retry ON external_jobs(status,next_attempt_at);
