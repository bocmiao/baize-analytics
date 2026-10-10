CREATE TABLE manual_search_imports (
 id uuid PRIMARY KEY,
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 label text NOT NULL,
 digest text NOT NULL,
 mapping jsonb NOT NULL,
 start_day date NOT NULL,
 end_day date NOT NULL,
 row_count integer NOT NULL CHECK(row_count>0 AND row_count<=100000),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(site_id,digest),
 UNIQUE(id,site_id)
);
CREATE TABLE manual_search_rows (
 import_id uuid NOT NULL,
 site_id text NOT NULL,
 row_number integer NOT NULL,
 day date NOT NULL,
 query text NOT NULL,
 page text NOT NULL,
 clicks bigint NOT NULL CHECK(clicks>=0),
 impressions bigint NOT NULL CHECK(impressions>=clicks),
 position double precision NOT NULL CHECK(position>=0),
 PRIMARY KEY(import_id,row_number),
 FOREIGN KEY(import_id,site_id) REFERENCES manual_search_imports(id,site_id) ON DELETE CASCADE
);
CREATE INDEX manual_search_site_day ON manual_search_rows(site_id,day);
