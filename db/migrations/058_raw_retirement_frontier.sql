-- A producer cutoff alone cannot represent a raw TTL ACK committed before the
-- next producer. This private sealed frontier is monotonic within a namespace.
CREATE TABLE analytics_raw_retirement_frontiers (
 site_id text PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
 canonical_epoch uuid NOT NULL,
 retired_before timestamptz NOT NULL,
 seal text NOT NULL
);
