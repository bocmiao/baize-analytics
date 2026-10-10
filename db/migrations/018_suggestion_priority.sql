ALTER TABLE ai_suggestions ADD COLUMN priority_score double precision NOT NULL DEFAULT 0 CHECK(priority_score>=0 AND priority_score<'Infinity'::double precision);
ALTER TABLE ai_suggestions ADD COLUMN priority_basis jsonb NOT NULL DEFAULT '{"status":"not-ranked","caveat":"旧建议没有优先级证据，不能推断收益"}';
