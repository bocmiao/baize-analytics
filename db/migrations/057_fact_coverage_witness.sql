CREATE TABLE analytics_fact_coverage_witnesses (
 site_id text PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
 version integer NOT NULL CHECK(version=1),
 state text NOT NULL CHECK(state IN('valid','invalid')),
 reason text,
 coverage_from timestamptz NOT NULL,
 observed_at timestamptz NOT NULL,
 accepted_outbox_high bigint NOT NULL CHECK(accepted_outbox_high>=0),
 aggregation_epoch uuid NOT NULL,
 canonical_epoch uuid NOT NULL,
 deletion_epoch bigint NOT NULL CHECK(deletion_epoch>=0),
 processed_generation bigint NOT NULL,
 non_event_generation bigint NOT NULL,
 config_hash text NOT NULL,
 closure_digest text NOT NULL,
 closure_rows bigint NOT NULL CHECK(closure_rows>=0),
 source_run_id uuid NOT NULL,
 seal text NOT NULL
);
