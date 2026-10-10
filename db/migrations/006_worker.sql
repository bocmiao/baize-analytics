ALTER TABLE aggregation_state ADD COLUMN attempts int NOT NULL DEFAULT 0;
ALTER TABLE aggregation_state ADD COLUMN last_error text;
ALTER TABLE aggregation_state ADD COLUMN dead_letter_at timestamptz;
