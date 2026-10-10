ALTER TABLE ai_suggestions ADD COLUMN category text NOT NULL DEFAULT 'analysis' CHECK(category IN('analysis','seo','performance','content'));
