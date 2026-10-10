-- Exact provider windows: never reconstruct distinct totalUsers by summing rows.
CREATE TABLE ga_import_windows (
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 start_day date NOT NULL,end_day date NOT NULL,property_id text NOT NULL,
 property_timezone text,data jsonb NOT NULL,imported_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(site_id,start_day,end_day),CHECK(start_day<=end_day)
);
