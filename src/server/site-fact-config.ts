import type {PoolClient} from 'pg';
import {invalidateSiteFacts} from './session-facts.js';
import {rebasePublishedFactEpoch} from './fact-invalidation.js';
/** Preserve unique archived backing. Changed session/timezone semantics cannot be
 * reconstructed from expired raw; mark those hours unavailable rather than zero. */
export async function invalidateSiteFactConfiguration(client:PoolClient,siteId:string){
 const published=(await client.query("SELECT 1 FROM analytics_fact_runs WHERE site_id=$1 AND query_version=2 AND status='published' LIMIT 1",[siteId])).rowCount;
 if(!published){await invalidateSiteFacts(client,siteId);return {relational:false,unavailableHours:0};}
 const marked=await client.query("UPDATE stats_hourly h SET data=h.data||jsonb_build_object('relationalUnavailable','configuration_requires_expired_raw_rebuild') FROM sites s WHERE s.id=h.site_id AND h.site_id=$1 AND h.hour<now()-(s.retention_days*interval '1 day')",[siteId]);
 await client.query('UPDATE aggregation_state SET epoch=gen_random_uuid() WHERE site_id=$1',[siteId]);await rebasePublishedFactEpoch(client,siteId);
 return {relational:true,unavailableHours:marked.rowCount??0};
}
export async function siteHasHistoricalIdentity(client:PoolClient,siteId:string):Promise<boolean>{
 const result=await client.query(`SELECT EXISTS(SELECT 1 FROM event_keys WHERE site_id=$1) OR EXISTS(SELECT 1 FROM canonical_event_members WHERE site_id=$1) OR EXISTS(SELECT 1 FROM analytics_fact_runs WHERE site_id=$1 AND status='published' AND source_events>0) OR EXISTS(SELECT 1 FROM visitor_first_seen WHERE site_id=$1) OR EXISTS(SELECT 1 FROM identity_bindings WHERE site_id=$1) OR EXISTS(SELECT 1 FROM replay_chunk_keys WHERE site_id=$1) OR EXISTS(SELECT 1 FROM stats_hourly WHERE site_id=$1) OR EXISTS(SELECT 1 FROM stats_daily WHERE site_id=$1) OR EXISTS(SELECT 1 FROM history_manifests WHERE site_id=$1 AND status='published') AS present`,[siteId]);return Boolean(result.rows[0].present);
}
