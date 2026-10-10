-- Minimal event-derived session topology, not PostgreSQL-only metadata.
-- Canonical event bodies, arbitrary properties, identify text and IP are excluded.
CREATE TABLE analytics_session_event_headers (
 run_id uuid NOT NULL REFERENCES analytics_fact_runs(id) ON DELETE CASCADE,
 event_id uuid NOT NULL,session_id uuid NOT NULL,visitor_id text NOT NULL,
 event_ts timestamptz NOT NULL,page_id uuid NOT NULL,event_type text NOT NULL,
 event_path text NOT NULL,dimensions jsonb NOT NULL,reducer_payload jsonb NOT NULL,
 body_seal text NOT NULL,
 PRIMARY KEY(run_id,event_id),
 CHECK(octet_length(dimensions::text)+octet_length(reducer_payload::text)+octet_length(event_path)<=16384)
);
CREATE INDEX analytics_session_headers_session ON analytics_session_event_headers(run_id,session_id,event_ts,event_id);
CREATE INDEX analytics_session_headers_visitor ON analytics_session_event_headers(run_id,visitor_id,event_ts,event_id);

-- A durable request preserves exactly which expired session needs recomputation.
-- Do not infer the affected session from every unrelated visitor in the same hour.
CREATE TABLE analytics_session_rebuild_requests (
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 run_id uuid NOT NULL REFERENCES analytics_fact_runs(id) ON DELETE CASCADE,
 session_id uuid NOT NULL,visitor_id text NOT NULL,
 reason text NOT NULL CHECK(reason='identity_interval'),
 PRIMARY KEY(site_id,run_id,session_id)
);
