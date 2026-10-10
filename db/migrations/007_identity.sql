-- Event-time identity episodes; identity_map is a latest-state projection only.
CREATE TABLE identity_bindings (
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 visitor_id text NOT NULL,user_id text NOT NULL,started_at timestamptz NOT NULL,ended_at timestamptz,
 PRIMARY KEY(site_id,visitor_id,started_at),CHECK(ended_at IS NULL OR ended_at>started_at)
);
CREATE INDEX identity_bindings_user ON identity_bindings(site_id,user_id,started_at);
CREATE INDEX identity_bindings_lookup ON identity_bindings(site_id,visitor_id,started_at,ended_at);
-- Existing rows cannot reconstruct previously overwritten identities. Bind only from recorded creation time.
INSERT INTO identity_bindings(site_id,visitor_id,user_id,started_at)
 SELECT site_id,visitor_id,user_id,created_at FROM identity_map;
CREATE TABLE identity_tombstones (
 site_id text NOT NULL,visitor_id text NOT NULL,user_id text NOT NULL,
 started_at timestamptz NOT NULL,ended_at timestamptz NOT NULL DEFAULT 'infinity',
 deleted_at timestamptz NOT NULL DEFAULT now(),source text NOT NULL DEFAULT 'identity-segment',
 PRIMARY KEY(site_id,visitor_id,user_id,started_at),CHECK(ended_at>started_at)
);
CREATE INDEX identity_tombstones_lookup ON identity_tombstones(site_id,visitor_id,started_at,ended_at);
