-- Independent staged checkpoints. Not activated until reducer and ownership queries are integrated.
CREATE TABLE analytics_carry_checkpoints (
 run_id uuid NOT NULL REFERENCES analytics_fact_runs(id) ON DELETE CASCADE,
 visitor_id text NOT NULL,session_id uuid NOT NULL,anchor_event_id uuid NOT NULL,
 through_ts timestamptz NOT NULL,last_event_id uuid NOT NULL,
 privacy_mode text NOT NULL CHECK(privacy_mode IN('standard','daily_salt')),
 local_day date NOT NULL,definitions_hash text NOT NULL,
 state jsonb NOT NULL,status text NOT NULL CHECK(status IN('valid','unavailable')),
 checksum text NOT NULL,
 PRIMARY KEY(run_id,visitor_id),CHECK(octet_length(state::text)<=16384)
);
CREATE TABLE analytics_carry_keys (
 run_id uuid NOT NULL,visitor_id text NOT NULL,session_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('page','heartbeat','order','goal','funnel')),
 key text NOT NULL,state jsonb NOT NULL,first_ts timestamptz NOT NULL,last_ts timestamptz NOT NULL,
 PRIMARY KEY(run_id,visitor_id,kind,key),
 FOREIGN KEY(run_id,visitor_id) REFERENCES analytics_carry_checkpoints(run_id,visitor_id) ON DELETE CASCADE,
 CHECK(first_ts<=last_ts),CHECK(octet_length(state::text)<=4096)
);
CREATE TABLE analytics_carry_heads (
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,visitor_id text NOT NULL,
 run_id uuid NOT NULL,epoch uuid NOT NULL,generation bigint NOT NULL,
 PRIMARY KEY(site_id,visitor_id),
 FOREIGN KEY(run_id,visitor_id) REFERENCES analytics_carry_checkpoints(run_id,visitor_id) ON DELETE CASCADE
);
CREATE TABLE analytics_session_contribution_heads (
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 session_id uuid NOT NULL,visitor_id text NOT NULL,
 run_id uuid NOT NULL REFERENCES analytics_fact_runs(id) ON DELETE CASCADE,
 epoch uuid NOT NULL,generation bigint NOT NULL,
 PRIMARY KEY(site_id,session_id)
);
CREATE INDEX analytics_carry_keys_interval ON analytics_carry_keys(run_id,visitor_id,first_ts,last_ts);
CREATE INDEX analytics_session_contribution_owner ON analytics_session_contribution_heads(run_id,session_id);
