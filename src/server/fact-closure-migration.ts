import type {ClickHouseSessionHeaderStore} from './session-header-store.js';
import {assertPublishedDailyFactProvenance} from './fact-migration-privacy.js';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {lockSite} from './db.js';
import {selectedFactRunPredicate,assertFactRunClosure} from './fact-run-closure.js';
import {publishRunFactBodies} from './fact-store-publication.js';
import {publishRemainingFactBodies} from './remaining-fact-publication.js';
import {verifyPublishedFactBodies} from './fact-body-verification.js';
import type {ClickHouseFactStore} from './fact-store.js';
import type {ClickHouseRemainingFactStore,RemainingFactFence} from './remaining-fact-store.js';

/** Backfill every selected old owner in place, preserving original run/PK,
 * contribution ownership, cents/currencies and weighted samples. Adapters
 * authenticate each input against its real published PG row before signing.
 * This migration does not prune, change authority or activate strict mode. */
export async function migratePublishedFactClosure(client:PoolClient,siteId:string,stores:{facts:ClickHouseFactStore;remaining:ClickHouseRemainingFactStore;headers?:ClickHouseSessionHeaderStore},fence:RemainingFactFence){
 await lockSite(client,siteId);
 const state=(await client.query('SELECT epoch,generation::text,processed_generation::text,lease_until>clock_timestamp() leased FROM aggregation_state WHERE site_id=$1 FOR UPDATE',[siteId])).rows[0];
 if(!state||state.epoch!==fence.expectedAggregationEpoch||state.generation!==state.processed_generation||state.leased)throw Error('FACT_CLOSURE_MIGRATION_FENCE');
 await assertFactRunClosure(client,siteId);await fence.verifyLiveFence();
 const cursor=`fact_closure_${randomUUID().replaceAll('-','')}`;let runs=0;
 await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT r.id FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id WHERE r.site_id=$1 AND ${selectedFactRunPredicate} ORDER BY r.id`,[siteId]);
 try{while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows;if(!rows.length)break;for(const row of rows){
  await assertPublishedDailyFactProvenance(client,siteId,row.id,stores.headers);
  await publishRunFactBodies(client,{stageRecords:(...args)=>stores.facts.migratePublishedRecords(...args),completeRunKind:(...args)=>stores.facts.completePublishedRunKind(...args)},siteId,row.id,fence);
  await publishRemainingFactBodies(client,{stageRecords:(...args)=>stores.remaining.migratePublishedRecords(...args),completeRunKind:(c,site,run,kind,f)=>stores.remaining.completePublishedRunKind(c,site,run,kind,f)},siteId,row.id,fence,stores.headers);
  await verifyPublishedFactBodies(client,siteId,row.id,stores);runs++;
 }}}finally{await client.query(`CLOSE ${cursor}`);}
 return {runs,pruned:false,strict:false};
}
