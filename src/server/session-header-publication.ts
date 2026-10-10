import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {SessionEventHeaderRecord} from './session-event-headers.js';
import type {ClickHouseSessionHeaderStore,SessionHeaderStageFence} from './session-header-store.js';
import {selectedFactRunPredicate,assertFactRunClosure} from './fact-run-closure.js';
import {lockSite} from './db.js';

/** SQL transaction-local producer staging is removed only after immutable CH
 * bodies and exact PG attempt receipts have both been acknowledged. */
export async function publishRunHeaders(client:PoolClient,store:ClickHouseSessionHeaderStore,siteId:string,runId:string,fence:SessionHeaderStageFence){
 let expectedRows=0;
 const cursor='header_publish_'+randomUUID().replaceAll('-','');
 await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT * FROM analytics_session_event_headers WHERE run_id=$1 ORDER BY event_id`,[runId]);
 try{while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows as SessionEventHeaderRecord[];if(!rows.length)break;await store.stageRows(client,siteId,runId,rows,fence);expectedRows+=rows.length;}}finally{await client.query(`CLOSE ${cursor}`);}
 await store.completeRun(client,siteId,runId,expectedRows,fence);
 await client.query('DELETE FROM analytics_session_event_headers WHERE run_id=$1',[runId]);
}

/** Completes old selected owners in place. Existing CH-only owners are verified,
 * not overwritten by an empty PG cursor. Body pruning is a separate operation. */
export async function migratePublishedHeaderClosure(client:PoolClient,store:ClickHouseSessionHeaderStore,siteId:string,fence:SessionHeaderStageFence){
 await lockSite(client,siteId);
 const state=(await client.query('SELECT epoch,generation=processed_generation clean,lease_until>clock_timestamp() leased FROM aggregation_state WHERE site_id=$1 FOR UPDATE',[siteId])).rows[0];
 if(state?.epoch!==fence.expectedAggregationEpoch||!state.clean||state.leased)throw Error('SESSION_HEADER_MIGRATION_FENCE');
 await assertFactRunClosure(client,siteId);await fence.verifyLiveFence();
 const cursor='header_migrate_'+randomUUID().replaceAll('-','');let runs=0;
 await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT r.id FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id WHERE r.site_id=$1 AND ${selectedFactRunPredicate} ORDER BY r.id`,[siteId]);
 try{while(true){const selected=(await client.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows;if(!selected.length)break;for(const run of selected){
  const complete=(await client.query("SELECT row_count FROM analytics_header_runs WHERE site_id=$1 AND run_id=$2 AND state='complete'",[siteId,run.id])).rows[0];
  if(complete){let count=0;for await(const rows of store.streamRows(client,siteId,run.id))count+=rows.length;if(count!==Number(complete.row_count))throw Error('SESSION_HEADER_COMPLETION_COUNT');runs++;continue;}
  const bodies='header_migrate_body_'+randomUUID().replaceAll('-','');let count=0;
  await client.query(`DECLARE ${bodies} NO SCROLL CURSOR FOR SELECT * FROM analytics_session_event_headers WHERE run_id=$1 ORDER BY event_id`,[run.id]);
  try{while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${bodies}`)).rows as SessionEventHeaderRecord[];if(!rows.length)break;await store.migratePublishedRows(client,siteId,run.id,rows,fence);count+=rows.length;}}finally{await client.query(`CLOSE ${bodies}`);}
  await store.completePublishedRun(client,siteId,run.id,count,fence);runs++;
 }}}finally{await client.query(`CLOSE ${cursor}`);}
 return {runs,pruned:false};
}

/** Reuse authenticated prefix topology from its exact selected owner. Old PG
 * runs are handled by the existing SQL copy; migrated runs have no PG bodies. */
export async function copyClickHousePrefixHeaders(client:PoolClient,store:ClickHouseSessionHeaderStore,siteId:string,newRun:string,sessionId:string,boundary:Date){
 const owner=(await client.query(`SELECT h.run_id FROM analytics_session_contribution_heads h JOIN aggregation_state a ON a.site_id=h.site_id WHERE h.site_id=$1 AND h.session_id=$2 AND h.epoch=a.epoch AND h.generation<=a.processed_generation AND EXISTS(SELECT 1 FROM analytics_header_batches b WHERE b.run_id=h.run_id AND b.site_id=h.site_id)`,[siteId,sessionId])).rows[0];
 if(!owner)return;
 for await(const rows of store.streamRows(client,siteId,owner.run_id,{sessionId,to:boundary})){
  const selected=rows.filter(row=>+new Date(row.event_ts)<+boundary).map(row=>({...row,run_id:newRun}));
  if(selected.length)await client.query(`INSERT INTO analytics_session_event_headers SELECT * FROM jsonb_to_recordset($1) h(run_id uuid,event_id uuid,session_id uuid,visitor_id text,event_ts timestamptz,page_id uuid,event_type text,event_path text,dimensions jsonb,reducer_payload jsonb,body_seal text) ON CONFLICT DO NOTHING`,[JSON.stringify(selected)]);
 }
}
