-- Immutable derived-cache bodies live in CH. PG retains publication/attempt receipts.
CREATE TABLE analytics_cache_owners (
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('hourly_rollup','daily_rollup','page_centroid','legacy_centroid','heatmap_cache')),
 state text NOT NULL CHECK(state IN('staging','complete')),
 aggregation_epoch uuid NOT NULL,source_aggregation_epoch uuid NOT NULL,
 canonical_epoch uuid,deletion_epoch bigint,live_canonical_epoch uuid,live_deletion_epoch bigint,generation bigint NOT NULL CHECK(generation>=0),
 row_count bigint NOT NULL DEFAULT 0 CHECK(row_count>=0),
 PRIMARY KEY(site_id,owner_id,kind)
);
CREATE TABLE analytics_cache_batches (
 id uuid PRIMARY KEY,site_id text NOT NULL,owner_id uuid NOT NULL,kind text NOT NULL,
 attempt_id uuid NOT NULL UNIQUE,row_count int NOT NULL CHECK(row_count BETWEEN 1 AND 100),checksum text NOT NULL,
 FOREIGN KEY(site_id,owner_id,kind) REFERENCES analytics_cache_owners(site_id,owner_id,kind) ON DELETE CASCADE
);
CREATE TABLE analytics_cache_members (
 site_id text NOT NULL,owner_id uuid NOT NULL,kind text NOT NULL,row_key text NOT NULL,
 batch_id uuid NOT NULL REFERENCES analytics_cache_batches(id) ON DELETE CASCADE,body_hash text NOT NULL,
 bucket_from timestamptz,bucket_to timestamptz,
 PRIMARY KEY(site_id,owner_id,kind,row_key),
 FOREIGN KEY(site_id,owner_id,kind) REFERENCES analytics_cache_owners(site_id,owner_id,kind) ON DELETE CASCADE
);
CREATE TABLE analytics_cache_pointers (
 site_id text NOT NULL,kind text NOT NULL,row_key text NOT NULL,owner_id uuid NOT NULL,
 PRIMARY KEY(site_id,kind,row_key),
 FOREIGN KEY(site_id,owner_id,kind,row_key) REFERENCES analytics_cache_members(site_id,owner_id,kind,row_key)
);
CREATE TABLE analytics_cache_gc (
 site_id text PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,next_attempt_id uuid,last_success_at timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),last_error_code text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- Heatmap base coverage names committed raw batches, never event-time guesses.
CREATE TABLE cache_heatmap_coverage_batches (
 site_id text NOT NULL,owner_id uuid NOT NULL,kind text NOT NULL DEFAULT 'heatmap_cache' CHECK(kind='heatmap_cache'),
 batch_id uuid NOT NULL,canonical_epoch uuid NOT NULL,deletion_epoch bigint NOT NULL,
 PRIMARY KEY(site_id,owner_id,batch_id),
 FOREIGN KEY(site_id,owner_id,kind) REFERENCES analytics_cache_owners(site_id,owner_id,kind) ON DELETE CASCADE
);
-- Privacy invalidation can destroy an unreconstructable retained legacy base.
-- Keep a metadata-only negative coverage proof; never turn missing history into zero.
CREATE TABLE analytics_cache_unavailable (
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,kind text NOT NULL,
 reason text NOT NULL CHECK(reason='privacy_invalidated'),rebuildable_v2 boolean NOT NULL DEFAULT false,rebuild_proof jsonb NOT NULL DEFAULT '[]'::jsonb,from_ts timestamptz,to_ts timestamptz,invalidated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(site_id,kind)
);
