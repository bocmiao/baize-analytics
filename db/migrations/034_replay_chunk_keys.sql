-- Canonical replay index contains no rrweb body. CH remains the sole raw source.
-- Record-time bounds identify potentially mixed-identity chunks; activation is
-- still gated until record-level physical deletion and restoration are verified.
CREATE TABLE replay_chunk_keys (
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 session_id text NOT NULL, seq bigint NOT NULL CHECK(seq>=0),
 event_id uuid NOT NULL, ts timestamptz NOT NULL, page_id uuid NOT NULL,
 visitor_id text NOT NULL, path text NOT NULL, payload_hash text NOT NULL,
 record_started_at timestamptz NOT NULL,record_ended_at timestamptz NOT NULL,
 PRIMARY KEY(site_id,session_id,seq), UNIQUE(site_id,event_id)
);
CREATE INDEX replay_chunk_keys_identity ON replay_chunk_keys(site_id,visitor_id,record_started_at,record_ended_at);
