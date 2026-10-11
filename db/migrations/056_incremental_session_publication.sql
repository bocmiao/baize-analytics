ALTER TABLE aggregation_state ADD COLUMN non_event_generation bigint NOT NULL DEFAULT 0;
UPDATE aggregation_state SET non_event_generation=generation;
CREATE FUNCTION record_aggregation_non_event_generation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.generation IS DISTINCT FROM OLD.generation OR NEW.epoch IS DISTINCT FROM OLD.epoch THEN
  IF NEW.epoch IS DISTINCT FROM OLD.epoch OR current_setting('baize.aggregation_ingest_site',true) IS DISTINCT FROM NEW.site_id THEN
   NEW.non_event_generation := GREATEST(OLD.non_event_generation,OLD.generation+1,NEW.generation);
  ELSE
   NEW.non_event_generation := OLD.non_event_generation;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aggregation_non_event_generation BEFORE UPDATE ON aggregation_state
 FOR EACH ROW EXECUTE FUNCTION record_aggregation_non_event_generation();
CREATE TABLE analytics_incremental_run_plans (
 run_id uuid PRIMARY KEY REFERENCES analytics_fact_runs(id) ON DELETE CASCADE,
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 parent_run_id uuid REFERENCES analytics_fact_runs(id) ON DELETE SET NULL,
 parent_generation bigint,
 mode text NOT NULL CHECK(mode IN('full','visitor_delta')),
 source_generation bigint NOT NULL,
 non_event_generation bigint NOT NULL,
 config_hash text NOT NULL,
 CHECK(mode<>'visitor_delta' OR parent_generation IS NOT NULL)
);
CREATE INDEX analytics_incremental_parent ON analytics_incremental_run_plans(parent_run_id);
CREATE TABLE analytics_incremental_run_visitors (
 run_id uuid NOT NULL REFERENCES analytics_incremental_run_plans(run_id) ON DELETE CASCADE,
 visitor_id text NOT NULL,PRIMARY KEY(run_id,visitor_id)
);
