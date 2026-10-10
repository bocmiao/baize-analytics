-- A validated shadow is tied to the intake high watermark and deletion epoch.
-- Read preference is deliberately not an authority switch.
ALTER TABLE canonical_migration_progress
 ADD COLUMN validated_generation bigint,
 ADD COLUMN validated_deletion_epoch bigint,
 ADD COLUMN validated_rows bigint,
 ADD COLUMN validated_at timestamptz,
 ADD COLUMN validated_privacy_mode text CHECK(validated_privacy_mode IN('standard','daily_salt')),
 ADD COLUMN validated_daily_columns_version integer CHECK(validated_daily_columns_version=1);
