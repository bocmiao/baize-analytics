ALTER TABLE event_store_state ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE event_store_uploads ADD COLUMN cleanup_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE event_store_uploads ADD COLUMN cleanup_owner uuid;
ALTER TABLE event_store_uploads ADD COLUMN cleanup_until timestamptz;
ALTER TABLE event_store_uploads ADD COLUMN cleanup_next_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE event_store_uploads ADD COLUMN cleanup_error text;
CREATE TABLE event_store_maintenance (
 site_id text PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
 last_retention_at timestamptz,
 lease_owner uuid,
 lease_until timestamptz,
 attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 last_error text
);
