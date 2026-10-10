CREATE TABLE instance_keyring(id boolean PRIMARY KEY DEFAULT true CHECK(id),active_version integer NOT NULL DEFAULT 1 CHECK(active_version>0));
INSERT INTO instance_keyring(id,active_version) VALUES(true,1);
CREATE TABLE sso_config(id boolean PRIMARY KEY DEFAULT true CHECK(id),encrypted jsonb NOT NULL,settings jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE sso_mappings(provider text NOT NULL,external_id text NOT NULL,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(provider,external_id));
CREATE TABLE sso_states(state_hash text PRIMARY KEY,binding_hash text NOT NULL,expires_at timestamptz NOT NULL);
