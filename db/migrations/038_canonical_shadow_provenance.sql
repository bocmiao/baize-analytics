-- Producer attestations retain no raw IP, UA, original page ID or event body.
-- Unknown pre-existing daily-salt events deliberately receive no implicit proof.
CREATE TABLE canonical_shadow_provenance (
 site_id text NOT NULL,
 event_id uuid NOT NULL,
 ts timestamptz NOT NULL,
 policy_version integer NOT NULL CHECK(policy_version=1),
 privacy_mode text NOT NULL CHECK(privacy_mode IN ('standard','daily_salt')),
 source_timezone text NOT NULL,
 source_day date NOT NULL,
 visitor_id text NOT NULL,
 page_id uuid NOT NULL,
 column_seal text NOT NULL CHECK(column_seal ~ '^[0-9a-f]{64}$'),
 body_hash text NOT NULL CHECK(body_hash ~ '^[0-9a-f]{64}$'),
 proof text NOT NULL CHECK(proof ~ '^[0-9a-f]{64}$'),
 PRIMARY KEY(site_id,event_id),
 FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE CASCADE
);
CREATE INDEX canonical_shadow_provenance_time ON canonical_shadow_provenance(site_id,ts);
CREATE INDEX canonical_shadow_provenance_columns ON canonical_shadow_provenance(site_id,ts,visitor_id,page_id);

-- Trusted reducer lineage for daily carry; checkpoints are not raw event bodies.
CREATE TABLE canonical_carry_provenance (
 run_id uuid NOT NULL,visitor_id text NOT NULL,anchor_event_id uuid NOT NULL,
 checkpoint_checksum text NOT NULL CHECK(checkpoint_checksum ~ '^[0-9a-f]{64}$'),
 lineage_seal text NOT NULL CHECK(lineage_seal ~ '^[0-9a-f]{64}$'),
 PRIMARY KEY(run_id,visitor_id),
 FOREIGN KEY(run_id,visitor_id) REFERENCES analytics_carry_checkpoints(run_id,visitor_id) ON DELETE CASCADE
);

CREATE TABLE canonical_provenance_replacements (
 site_id text NOT NULL,replacement_event_id uuid NOT NULL,original_event_id uuid NOT NULL,
 context text NOT NULL CHECK(octet_length(context)<=32768),
 PRIMARY KEY(site_id,replacement_event_id),
 FOREIGN KEY(site_id,replacement_event_id) REFERENCES canonical_shadow_provenance(site_id,event_id) ON DELETE CASCADE,
 FOREIGN KEY(site_id,original_event_id) REFERENCES canonical_shadow_provenance(site_id,event_id) ON DELETE CASCADE
);
