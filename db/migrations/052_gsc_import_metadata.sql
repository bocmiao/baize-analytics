CREATE TABLE gsc_import_windows(
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 start_day date NOT NULL,end_day date NOT NULL,
 metadata jsonb NOT NULL,imported_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(site_id,start_day,end_day),CHECK(start_day<=end_day)
);
