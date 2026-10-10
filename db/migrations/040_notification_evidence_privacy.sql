-- Legacy derived notification snapshots had no authoritative aggregation epoch.
-- Revoke rather than relabel old private evidence as newly collected facts.
UPDATE notification_jobs
SET body=jsonb_build_object('invalidated',true,'reason','legacy-unbound-derived-evidence'),
    status='revoked',lease_until=NULL,last_error=NULL
WHERE (body->>'kind' IN('traffic','goal','funnel') OR dedupe_key LIKE 'report:%')
  AND (body->>'aggregationEpoch' IS NULL OR NOT EXISTS(
    SELECT 1 FROM aggregation_state a WHERE a.site_id=notification_jobs.site_id
      AND body->>'aggregationEpoch'=a.epoch::text));
