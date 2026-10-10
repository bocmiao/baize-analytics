CREATE TABLE revenue_orders(
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 order_hash text NOT NULL,
 visitor_id text NOT NULL,
 event_id uuid NOT NULL,
 ts timestamptz NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 amount numeric NOT NULL CHECK(amount >= 0),
 privacy_mode text NOT NULL CHECK(privacy_mode IN ('standard','daily_salt')),
 order_day date,
 PRIMARY KEY(site_id,order_hash),
 FOREIGN KEY(site_id,event_id,ts) REFERENCES events(site_id,event_id,ts) ON DELETE CASCADE,
 CHECK((privacy_mode='standard' AND order_day IS NULL) OR (privacy_mode='daily_salt' AND order_day IS NOT NULL))
);
CREATE INDEX revenue_orders_visitor ON revenue_orders(site_id,visitor_id);
CREATE INDEX revenue_orders_retention ON revenue_orders(site_id,ts);
