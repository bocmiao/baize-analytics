-- Revenue receipt lifetime follows accepted-event metadata, not optional PG raw
-- bodies. Canonical CH acceptance inserts event_keys in the same transaction.
ALTER TABLE revenue_orders DROP CONSTRAINT revenue_orders_site_id_event_id_ts_fkey;
ALTER TABLE revenue_orders ADD CONSTRAINT revenue_orders_event_receipt_fkey
 FOREIGN KEY(site_id,event_id) REFERENCES event_keys(site_id,event_id) ON DELETE CASCADE;
