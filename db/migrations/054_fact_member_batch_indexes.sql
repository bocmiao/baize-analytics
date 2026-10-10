-- Exact manifest receipt reads filter by batch_id and order by row_key.
-- Nonunique lookup indexes only: preserve existing PK/FK and receipt semantics.
CREATE INDEX analytics_fact_store_members_batch_key
 ON analytics_fact_store_members(batch_id,row_key);
CREATE INDEX analytics_remaining_fact_members_batch_key
 ON analytics_remaining_fact_members(batch_id,row_key);
