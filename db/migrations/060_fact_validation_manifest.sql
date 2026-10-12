-- Optional, versioned proof of publication-time full validation. Existing
-- receipts remain legacy NULL/NULL and retain full per-row verification.
ALTER TABLE analytics_fact_store_batches
 ADD COLUMN validation_schema_version smallint,
 ADD COLUMN validation_seal text,
 ADD CONSTRAINT analytics_fact_store_validation_manifest CHECK (
  (validation_schema_version IS NULL AND validation_seal IS NULL) OR
  (validation_schema_version IS NOT NULL AND validation_schema_version=1 AND validation_seal ~ '^[a-f0-9]{64}$' AND validation_seal IS NOT NULL)
 );
