CREATE TABLE instance_settings(name text PRIMARY KEY,encrypted jsonb NOT NULL,settings jsonb NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now());
