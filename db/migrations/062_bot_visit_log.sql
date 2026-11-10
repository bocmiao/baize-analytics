CREATE TABLE bot_visit_log (
  site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('collector','server_log')),
  visited_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  engine text NOT NULL CHECK (length(engine) BETWEEN 1 AND 64),
  category text NOT NULL CHECK (category IN ('ai','bot')),
  reason text NOT NULL CHECK (reason IN ('ua','request_burst')),
  rule_id text NOT NULL CHECK (length(rule_id)<=64),
  path text NOT NULL CHECK (length(path) BETWEEN 1 AND 2048 AND path NOT LIKE '%?%' AND path NOT LIKE '%#%'),
  ip_identity text CHECK (ip_identity ~ '^v1:[a-f0-9]{64}$'),
  ip_prefix text CHECK (length(ip_prefix)<=64),
  receipt_hash text NOT NULL CHECK (receipt_hash ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (site_id,source,id)
);
CREATE INDEX bot_visit_log_site_time ON bot_visit_log(site_id,visited_at DESC,id DESC);
CREATE INDEX bot_visit_log_site_engine_time ON bot_visit_log(site_id,engine,visited_at DESC);
CREATE INDEX bot_visit_log_expiry ON bot_visit_log(expires_at);
