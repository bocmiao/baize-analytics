import {getFactStore} from './fact-store.js';
import {getRemainingFactStore} from './remaining-fact-store.js';
import {rebaseHeaderPublishedEpoch} from './session-header-lifecycle.js';
import type {Pool,PoolClient} from 'pg';
import {invalidateSiteFacts} from './session-facts.js';
import {rebasePublishedFactEpoch} from './fact-invalidation.js';
/** Preserve unique archived backing. Changed session/timezone semantics cannot be
 * reconstructed from expired raw; mark those hours unavailable rather than zero. */
export async function invalidateSiteFactConfiguration(client:PoolClient,siteId:string,pool?:Pool){
 const published=(await client.query("SELECT 1 FROM analytics_fact_runs WHERE site_id=$1 AND query_version=2 AND status='published' LIMIT 1",[siteId])).rowCount;
 if(!published){await invalidateSiteFacts(client,siteId);return {relational:false,unavailableHours:0};}
 const marked=await client.query("UPDATE stats_hourly h SET data=h.data||jsonb_build_object('relationalUnavailable','configuration_requires_expired_raw_rebuild') FROM sites s WHERE s.id=h.site_id AND h.site_id=$1 AND h.hour<now()-(s.retention_days*interval '1 day')",[siteId]);
 await client.query('UPDATE aggregation_state SET epoch=gen_random_uuid() WHERE site_id=$1',[siteId]);await rebasePublishedFactEpoch(client,siteId);
 // Configuration changes rotate only the live aggregation fence. Original
 // sealed source epochs/attempts/hash remain immutable; adapters reuse this
 // held client and never acquire another connection while the site gate is held.
 const epoch=(await client.query('SELECT epoch::text FROM aggregation_state WHERE site_id=$1',[siteId])).rows[0].epoch;
 const tables=(await client.query("SELECT to_regclass('analytics_header_batches') AS headers,to_regclass('analytics_fact_store_batches') AS facts,to_regclass('analytics_remaining_fact_batches') AS remaining")).rows[0];
 const facts=pool?getFactStore(pool):undefined,remaining=pool?getRemainingFactStore(pool):undefined;
 if(tables.headers)await rebaseHeaderPublishedEpoch(client,siteId);
 if(tables.facts){if(facts)await facts.rebasePublishedRuns(client,siteId,epoch);else if((await client.query('SELECT 1 FROM analytics_fact_store_runs WHERE site_id=$1 LIMIT 1',[siteId])).rowCount)throw Error('FACT_STORE_CONFIG_REBASE_UNAVAILABLE');}
 if(tables.remaining){if(remaining)await remaining.rebasePublishedRuns(client,siteId,epoch);else if((await client.query('SELECT 1 FROM analytics_remaining_fact_runs WHERE site_id=$1 LIMIT 1',[siteId])).rowCount)throw Error('REMAINING_FACT_CONFIG_REBASE_UNAVAILABLE');}
 return {relational:true,unavailableHours:marked.rowCount??0};
}
export async function siteHasHistoricalIdentity(client:PoolClient,siteId:string):Promise<boolean>{
 const result=await client.query(`SELECT EXISTS(SELECT 1 FROM event_keys WHERE site_id=$1) OR EXISTS(SELECT 1 FROM canonical_event_members WHERE site_id=$1) OR EXISTS(SELECT 1 FROM analytics_fact_runs WHERE site_id=$1 AND status='published' AND source_events>0) OR EXISTS(SELECT 1 FROM analytics_carry_heads WHERE site_id=$1) OR EXISTS(SELECT 1 FROM analytics_session_contribution_heads WHERE site_id=$1) OR EXISTS(SELECT 1 FROM analytics_session_event_headers h JOIN analytics_fact_runs r ON r.id=h.run_id WHERE r.site_id=$1 AND r.status IN('staging','ready','published')) OR EXISTS(SELECT 1 FROM visitor_first_seen WHERE site_id=$1) OR EXISTS(SELECT 1 FROM identity_bindings WHERE site_id=$1) OR EXISTS(SELECT 1 FROM replay_chunk_keys WHERE site_id=$1) OR EXISTS(SELECT 1 FROM stats_hourly WHERE site_id=$1) OR EXISTS(SELECT 1 FROM stats_daily WHERE site_id=$1) OR EXISTS(SELECT 1 FROM history_manifests WHERE site_id=$1 AND status='published') AS present`,[siteId]);return Boolean(result.rows[0].present);
}
