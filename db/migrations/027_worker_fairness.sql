-- Fair round-robin scheduling is independent of event-time watermarks and arrival generation.
ALTER TABLE aggregation_state ADD COLUMN last_claimed_at timestamptz;
CREATE INDEX aggregation_fair_claim ON aggregation_state(last_claimed_at NULLS FIRST,site_id)
  WHERE attempts<3 AND processed_generation<generation;
