-- Immutable first-cutover proof: no raw events, identities or fact bodies.
CREATE TABLE canonical_cutover_receipts (
 site_id text PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
 old_head_run uuid,
 aggregation_epoch uuid NOT NULL,
 processed_generation bigint NOT NULL,
 canonical_epoch uuid NOT NULL,
 deletion_epoch bigint NOT NULL,
 validated_generation bigint NOT NULL,
 closure_hash text NOT NULL CHECK(closure_hash ~ '^[0-9a-f]{64}$'),
 closure_count bigint NOT NULL CHECK(closure_count>=0),
 repair_aggregation_epoch uuid,
 repair_processed_generation bigint,
 repair_deletion_epoch bigint,
 repair_closure_hash text CHECK(repair_closure_hash ~ '^[0-9a-f]{64}$'),
 repair_closure_count bigint CHECK(repair_closure_count>=0),
 repair_journal_scope text CHECK(repair_journal_scope ~ '^[0-9a-f]{64}$'),
 repaired_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
