-- Final tool traces are separate from the already-immutable pre-request ai_calls evidence.
CREATE UNIQUE INDEX ai_calls_id_site_unique ON ai_calls(id,site_id);
CREATE TABLE ai_question_evidence (
 call_id uuid PRIMARY KEY,
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 evidence jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(call_id,site_id) REFERENCES ai_calls(id,site_id) ON DELETE CASCADE
);
CREATE FUNCTION preserve_ai_question_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'AI question evidence is immutable'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_ai_question_evidence BEFORE UPDATE ON ai_question_evidence FOR EACH ROW EXECUTE FUNCTION preserve_ai_question_evidence();
