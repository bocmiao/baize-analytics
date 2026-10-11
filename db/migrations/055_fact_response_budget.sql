-- Scheduling metadata only; legacy NULL receipts retain the prior three-batch path.
ALTER TABLE analytics_fact_store_batches
 ADD COLUMN response_byte_upper_bound bigint,
 ADD COLUMN response_bound_seal text,
 ADD CONSTRAINT analytics_fact_response_bound_pair CHECK (
  (response_byte_upper_bound IS NULL AND response_bound_seal IS NULL) OR
  (response_byte_upper_bound IS NOT NULL AND response_byte_upper_bound BETWEEN 44548 AND 16777216 AND response_bound_seal ~ '^[a-f0-9]{64}$' AND response_bound_seal IS NOT NULL)
 );
