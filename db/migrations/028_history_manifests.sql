CREATE TABLE history_manifests (
 id uuid PRIMARY KEY,
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 namespace uuid NOT NULL,
 epoch uuid NOT NULL,
 generation bigint NOT NULL,
 outbox_high_watermark bigint NOT NULL,
 status text NOT NULL CHECK(status IN ('capturing','published','failed','obsolete')),
 manifest jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz,
 error_code text
);
CREATE INDEX history_manifests_site ON history_manifests(site_id,status,created_at);
CREATE TABLE history_backup_files (
 id uuid PRIMARY KEY,
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 temporary_token uuid,
 key_version int NOT NULL,
 bytes bigint NOT NULL,
 status text NOT NULL CHECK(status IN ('writing','ready','revoked','removed')),
 cleanup_attempts int NOT NULL DEFAULT 0,
 cleanup_error text,
 next_cleanup_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now()
);
