-- Conversion flags are a cache; retain immutable event-time facts for identity deletion.
ALTER TABLE experiments ADD COLUMN conversion_history_status text NOT NULL DEFAULT 'complete'
 CHECK(conversion_history_status IN('complete','partial_unavailable'));
CREATE TABLE experiment_contributions(
 experiment_id uuid NOT NULL,
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 visitor_id text NOT NULL,
 event_id uuid NOT NULL,
 ts timestamptz NOT NULL,
 PRIMARY KEY(experiment_id,event_id),
 FOREIGN KEY(experiment_id,visitor_id) REFERENCES experiment_assignments(experiment_id,visitor_id) ON DELETE CASCADE
);
CREATE INDEX experiment_contributions_identity_time ON experiment_contributions(site_id,visitor_id,ts);
INSERT INTO experiment_contributions(experiment_id,site_id,visitor_id,event_id,ts)
 SELECT a.experiment_id,e.site_id,e.visitor_id,e.event_id,e.ts
 FROM experiment_assignments a JOIN experiments x ON x.id=a.experiment_id
 JOIN events e ON e.site_id=x.site_id AND e.visitor_id=a.visitor_id
 JOIN sites s ON s.id=e.site_id
 WHERE s.privacy_mode='standard' AND e.type='event' AND NOT e.is_bot
 AND e.payload->>'event_name'=x.goal
 AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=e.site_id AND t.visitor_id=e.visitor_id)
 AND NOT EXISTS(SELECT 1 FROM identity_tombstones t WHERE t.site_id=e.site_id AND t.visitor_id=e.visitor_id AND t.started_at<=e.ts AND t.ended_at>e.ts)
 ON CONFLICT DO NOTHING;
UPDATE experiments x SET conversion_history_status='partial_unavailable'
 WHERE EXISTS(SELECT 1 FROM experiment_assignments a WHERE a.experiment_id=x.id AND a.converted
 AND NOT EXISTS(SELECT 1 FROM experiment_contributions c WHERE c.experiment_id=a.experiment_id AND c.visitor_id=a.visitor_id));
UPDATE experiment_assignments a SET converted=EXISTS(
 SELECT 1 FROM experiment_contributions c WHERE c.experiment_id=a.experiment_id AND c.visitor_id=a.visitor_id);
