CREATE TABLE sessions (
 id uuid PRIMARY KEY, site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE, visitor_id text NOT NULL,
 started_at timestamptz NOT NULL,last_active timestamptz NOT NULL,entry_path text NOT NULL,exit_path text NOT NULL,
 pageviews int NOT NULL,duration_s double precision NOT NULL,visible_ms double precision NOT NULL,bounced boolean NOT NULL,
 dimensions jsonb NOT NULL DEFAULT '{}',generation bigint NOT NULL
);
CREATE INDEX ON sessions(site_id,started_at);
CREATE TABLE stats_hourly(site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,hour timestamptz NOT NULL,data jsonb NOT NULL,generation bigint NOT NULL,PRIMARY KEY(site_id,hour));
CREATE TABLE stats_daily(site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,day date NOT NULL,data jsonb NOT NULL,generation bigint NOT NULL,PRIMARY KEY(site_id,day));
CREATE TABLE page_vitals(site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,day date NOT NULL,path text NOT NULL,metric text NOT NULL,digest jsonb NOT NULL,sample_count int NOT NULL,PRIMARY KEY(site_id,day,path,metric));
CREATE TABLE goals(id uuid PRIMARY KEY,site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,name text NOT NULL,type text NOT NULL CHECK(type IN ('event','page','duration')),config jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE funnels(id uuid PRIMARY KEY,site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,name text NOT NULL,steps jsonb NOT NULL,strict boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE analytics_definitions(site_id text PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,data jsonb NOT NULL DEFAULT '{}',generation bigint NOT NULL);
