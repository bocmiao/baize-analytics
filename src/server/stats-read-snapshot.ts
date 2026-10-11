import {measurePerformanceStage} from './performance-observation.js';
import {registerStatsMirrorSnapshot} from './stats-read-client-scope.js';
import {withStatsReadBudget,budgetedPoolConnect,withBudgetedPgClient} from './stats-read-budget.js';
import type {PoolClient} from 'pg';
import type {AppContext} from './context.js';
import {beginSiteSnapshot} from './site-snapshot.js';
import {withRemainingFactReadSource} from './remaining-fact-source.js';
import {ApplicationError} from '../shared/error-codes.js';

/** Comparison ranges share only one authenticated transaction-local projection.
 * This is not a cache across requests, commits, sites or source epochs. */
export async function withStatsReadSnapshot<T>(ctx:AppContext,siteId:string,from:string,to:string,read:(client:PoolClient)=>Promise<T>):Promise<{value:T;dirty:boolean}>{
 return withStatsReadBudget(async()=>{const client=await budgetedPoolConnect(ctx.pool);try{return await withBudgetedPgClient(client,async()=>{
 const stateSql='SELECT a.epoch::text,a.generation::text,a.processed_generation::text,c.authority,c.epoch::text AS canonical_epoch,c.deletion_epoch::text,e.mode AS mirror_mode,e.snapshot_id::text AS mirror_snapshot_id,e.snapshot_epoch::text AS mirror_epoch,e.snapshot_generation::text AS mirror_generation,e.replica_format AS mirror_format FROM aggregation_state a LEFT JOIN canonical_event_authority c ON c.site_id=a.site_id LEFT JOIN event_store_state e ON e.site_id=a.site_id WHERE a.site_id=$1';
 let revoke:(()=>void)|undefined;try{await beginSiteSnapshot(client,siteId);revoke=registerStatsMirrorSnapshot(client,siteId);const {captured,value}=await measurePerformanceStage('stats_snapshot_hold',async()=>{const captured=(await client.query(stateSql,[siteId])).rows[0];
  const relational=(await client.query("SELECT 1 FROM analytics_fact_runs WHERE site_id=$1 AND query_version=2 AND status='published' LIMIT 1",[siteId])).rowCount;
  const legacy=relational&&(await client.query("SELECT 1 FROM stats_hourly WHERE site_id=$1 AND hour>=date_trunc('hour',$2::timestamptz) AND hour<$3::timestamptz AND NOT(data ? 'relationalVersion') LIMIT 1",[siteId,from,to])).rowCount;
  // Legacy cache wrappers do not reuse existing cache context: preserve their original reads.
  const value=relational&&!legacy?await withRemainingFactReadSource(client,ctx.pool,siteId,()=>read(client)):await read(client);
  await client.query('COMMIT');return {captured,value};});const live=(await client.query(stateSql,[siteId])).rows[0];
  if(live?.epoch!==captured?.epoch||live?.authority!==captured?.authority||live?.canonical_epoch!==captured?.canonical_epoch||live?.deletion_epoch!==captured?.deletion_epoch||live?.mirror_mode!==captured?.mirror_mode||live?.mirror_snapshot_id!==captured?.mirror_snapshot_id||live?.mirror_epoch!==captured?.mirror_epoch||live?.mirror_generation!==captured?.mirror_generation||live?.mirror_format!==captured?.mirror_format)throw new ApplicationError('aggregate_source_changed');
  return {value,dirty:live?.processed_generation!==captured?.processed_generation||live?.generation!==live?.processed_generation};
 }catch(error){await client.query('ROLLBACK').catch(()=>undefined);if(error instanceof Error&&(error.message.startsWith('FACT_STORE_')||error.message.startsWith('REMAINING_FACT_')||error.message.startsWith('CACHE_')))throw new ApplicationError(error.message==='FACT_STORE_SOURCE_FENCE'?'aggregate_source_changed':'aggregate_members_unavailable');throw error;}finally{revoke?.();}
});}finally{client.release();}});
}
