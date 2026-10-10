CREATE TABLE event_store_state (
 site_id text PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
 mode text NOT NULL DEFAULT 'postgres' CHECK(mode IN ('postgres','mirror','prefer_clickhouse')),
 snapshot_id uuid,
 snapshot_epoch uuid,
 snapshot_generation bigint NOT NULL DEFAULT -1,
 snapshot_count bigint NOT NULL DEFAULT 0,
 watermark timestamptz,
 captured_outbox_id bigint NOT NULL DEFAULT 0,
 published_at timestamptz,
 lease_owner uuid,
 lease_until timestamptz,
 attempts integer NOT NULL DEFAULT 0,
 last_error text,
 dead_letter_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE event_store_uploads (
 snapshot_id uuid PRIMARY KEY,
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 epoch uuid NOT NULL,
 generation bigint NOT NULL,
 status text NOT NULL CHECK(status IN ('uploading','published','obsolete','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
CREATE INDEX event_store_uploads_cleanup ON event_store_uploads(site_id,status,created_at);
