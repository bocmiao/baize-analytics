-- Old summaries cannot disclose which currencies contributed to a currencyless amount.
UPDATE stats_hourly SET data=jsonb_set(data || '{"legacyCurrencyUnsupported":true}'::jsonb,'{revenue}','null'::jsonb) WHERE NOT(data ? 'revenueByCurrency');
UPDATE stats_daily SET data=jsonb_set(data || '{"legacyCurrencyUnsupported":true}'::jsonb,'{revenue}','null'::jsonb) WHERE NOT(data ? 'revenueByCurrency');
INSERT INTO aggregation_state(site_id,generation,epoch)
 SELECT id,1,gen_random_uuid() FROM sites
 ON CONFLICT(site_id) DO UPDATE SET generation=aggregation_state.generation+1,epoch=gen_random_uuid(),lease_owner=NULL,lease_until=NULL,attempts=0,last_error=NULL,dead_letter_at=NULL;
