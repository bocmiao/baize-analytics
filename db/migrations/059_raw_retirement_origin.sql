-- Existing missing frontiers are unknown history, never evidence of no TTL.
CREATE TABLE analytics_raw_retirement_origins (
 site_id text PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
 origin_id uuid NOT NULL,
 classification text NOT NULL CHECK(classification IN('legacy_unknown','known_frontier','new_site_pending','authenticated_new_site')),
 seal text,
 CHECK(classification<>'authenticated_new_site' OR seal IS NOT NULL)
);
INSERT INTO analytics_raw_retirement_origins(site_id,origin_id,classification)
 SELECT s.id,gen_random_uuid(),CASE WHEN f.site_id IS NULL THEN 'legacy_unknown' ELSE 'known_frontier' END
 FROM sites s LEFT JOIN analytics_raw_retirement_frontiers f ON f.site_id=s.id;
CREATE FUNCTION initialize_raw_retirement_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO analytics_raw_retirement_origins(site_id,origin_id,classification)
 VALUES(NEW.id,gen_random_uuid(),'new_site_pending');
 RETURN NEW;
END $$;
CREATE TRIGGER site_raw_retirement_origin AFTER INSERT ON sites
 FOR EACH ROW EXECUTE FUNCTION initialize_raw_retirement_origin();
