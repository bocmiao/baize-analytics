-- Authority is independent of read preference. No automatic PG pruning/cutover.
CREATE TABLE canonical_event_authority (
 site_id text PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
 authority text NOT NULL DEFAULT 'postgres' CHECK(authority IN ('postgres','clickhouse')),
 epoch uuid NOT NULL,
 deletion_epoch bigint NOT NULL DEFAULT 0,
 raw_pruned boolean NOT NULL DEFAULT false
);
CREATE TABLE canonical_event_batches (
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 batch_id uuid NOT NULL,
 attempt_id uuid NOT NULL,
 epoch uuid NOT NULL,
 deletion_epoch bigint NOT NULL,
 checksum text NOT NULL,
 row_count int NOT NULL CHECK(row_count BETWEEN 1 AND 1000),
 published_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(site_id,batch_id), UNIQUE(attempt_id)
);
CREATE TABLE canonical_event_members (
 site_id text NOT NULL,
 event_id uuid NOT NULL,
 batch_id uuid NOT NULL,
 body_hash text NOT NULL,
 visitor_id text NOT NULL,
 ts timestamptz NOT NULL,
 PRIMARY KEY(site_id,event_id),
 FOREIGN KEY(site_id,batch_id) REFERENCES canonical_event_batches(site_id,batch_id) ON DELETE CASCADE
);
CREATE TABLE canonical_migration_progress (
 site_id text PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
 epoch uuid NOT NULL,
 phase text NOT NULL DEFAULT 'shadow' CHECK(phase IN ('shadow','validated','pruning','complete')),
 shadow_ts timestamptz, shadow_event_id uuid,
 prune_ts timestamptz, prune_event_id uuid,
 updated_at timestamptz NOT NULL DEFAULT now()
);
