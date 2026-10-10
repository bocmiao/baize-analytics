-- Opt-in incremental replica; PostgreSQL remains the canonical source.
ALTER TABLE event_store_state ADD COLUMN replica_format text NOT NULL DEFAULT 'snapshot_v1'
 CHECK(replica_format IN ('snapshot_v1','incremental_v1'));
CREATE TABLE event_store_batches(
 id uuid PRIMARY KEY,site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 snapshot_id uuid NOT NULL,epoch uuid NOT NULL,generation bigint NOT NULL,
 after_outbox_id bigint NOT NULL,through_outbox_id bigint NOT NULL,
 bootstrap boolean NOT NULL,row_count bigint NOT NULL DEFAULT 0,
 status text NOT NULL CHECK(status IN ('uploading','published','failed','obsolete')),
 created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 cleanup_attempts integer NOT NULL DEFAULT 0,cleanup_error text,
 cleanup_next_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_store_batches_cleanup ON event_store_batches(site_id,status,created_at);
