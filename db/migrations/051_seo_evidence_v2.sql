ALTER TABLE seo_scans ADD COLUMN metadata jsonb NOT NULL DEFAULT '{"version":1,"coverage":"unknown","renderMode":"initial-html"}'::jsonb;
