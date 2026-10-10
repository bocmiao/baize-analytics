CREATE TABLE external_connections (
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE, kind text NOT NULL,
 encrypted jsonb NOT NULL, settings jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(site_id,kind)
);
CREATE TABLE oauth_states (state_hash text PRIMARY KEY, session_hash text NOT NULL, user_id uuid NOT NULL, site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE, verifier_encrypted jsonb NOT NULL, expires_at timestamptz NOT NULL, kind text NOT NULL);
CREATE TABLE gsc_stats(site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE, day date NOT NULL, query text NOT NULL, page text NOT NULL, clicks double precision NOT NULL, impressions double precision NOT NULL, position double precision NOT NULL, PRIMARY KEY(site_id,day,query,page));
CREATE TABLE ga_import(site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE, day date NOT NULL, source text NOT NULL, pv bigint NOT NULL, uv bigint NOT NULL, sessions bigint NOT NULL, imported_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(site_id,day,source));
CREATE TABLE seo_scans(id uuid PRIMARY KEY,site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT now(),results jsonb NOT NULL);
CREATE TABLE rank_history(site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,day date NOT NULL,keyword text NOT NULL,provider text NOT NULL,position integer,PRIMARY KEY(site_id,day,keyword,provider));
CREATE TABLE ai_budget(site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,month date NOT NULL,reserved bigint NOT NULL DEFAULT 0,used bigint NOT NULL DEFAULT 0,PRIMARY KEY(site_id,month));
CREATE TABLE ai_calls(id uuid PRIMARY KEY,site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT now(),purpose text NOT NULL,tokens bigint NOT NULL DEFAULT 0,status text NOT NULL,evidence jsonb NOT NULL,answer text);
CREATE TABLE ai_suggestions(id uuid PRIMARY KEY,site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,evidence_id uuid NOT NULL REFERENCES ai_calls(id),status text NOT NULL DEFAULT 'new',title text NOT NULL,confidence text NOT NULL,implemented_at timestamptz,recheck jsonb);

CREATE FUNCTION preserve_ai_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.evidence IS DISTINCT FROM OLD.evidence THEN RAISE EXCEPTION 'AI evidence is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER immutable_ai_evidence BEFORE UPDATE ON ai_calls FOR EACH ROW EXECUTE FUNCTION preserve_ai_evidence();
