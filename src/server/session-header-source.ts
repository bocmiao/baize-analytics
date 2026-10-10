import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import type {AnalyticsEvent} from './analytics.js';
import {sessionContributionPredicate,assertSessionContributionOwners} from './session-contribution-overlay.js';
import {streamPublishedSessionHeaderEvents,verifySessionEventHeaderRecords} from './session-event-headers.js';
import type {SessionEventHeaderRecord} from './session-event-headers.js';
import {getSessionHeaderStore} from './session-header-store.js';

/** Caller owns a transaction and its partition/site fence. The pool is registry
 * identity only: this bridge never borrows a second connection. TEMP records are
 * bounded transport staging, not a persistent PostgreSQL header-body replica. */
export async function* streamSelectedHeaders(client:PoolClient,pool:Pool,siteId:string,options:{mode?:'postgres'|'clickhouse'}={}):AsyncIterable<AnalyticsEvent[]>{
 const authority=(await client.query('SELECT authority FROM canonical_event_authority WHERE site_id=$1',[siteId])).rows[0]?.authority;
 const useCH=options.mode==='clickhouse'||(options.mode!=='postgres'&&authority==='clickhouse');
 if(!useCH){yield* streamPublishedSessionHeaderEvents(client,siteId);return;}
 const store=getSessionHeaderStore(pool);if(!store)throw Error('SESSION_HEADER_STORE_REQUIRED');
 await assertSessionContributionOwners(client,siteId);
 const epoch=(await client.query('SELECT epoch::text FROM aggregation_state WHERE site_id=$1',[siteId])).rows[0]?.epoch;
 if(!epoch)throw Error('SESSION_HEADER_SOURCE_FENCE');
 const table=`header_stage_${randomUUID().replaceAll('-','')}`,cursor=`header_source_${randomUUID().replaceAll('-','')}`;
 let opened=false;
 await client.query(`CREATE TEMP TABLE ${table}(run_id uuid,event_id uuid,session_id uuid,visitor_id text,event_ts timestamptz,page_id uuid,event_type text,event_path text,dimensions jsonb,reducer_payload jsonb,body_seal text,PRIMARY KEY(run_id,event_id)) ON COMMIT DROP`);
 try{
  // Membership is selected by published references, never generation alone.
  // Stream the run list through a cursor too, avoiding an all-site run array.
  const runs=`header_runs_${randomUUID().replaceAll('-','')}`;
  await client.query(`DECLARE ${runs} NO SCROLL CURSOR FOR SELECT r.id FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id WHERE r.site_id=$1 AND r.status='published' AND r.epoch=a.epoch AND (EXISTS(SELECT 1 FROM analytics_session_contribution_heads h WHERE h.site_id=$1 AND h.run_id=r.id AND h.epoch=a.epoch AND h.generation<=a.processed_generation) OR EXISTS(SELECT 1 FROM analytics_relational_buckets b WHERE b.site_id=$1 AND b.run_id=r.id) OR r.id=(SELECT id FROM analytics_fact_runs WHERE site_id=$1 AND query_version=2 AND status='published' ORDER BY generation DESC,created_at DESC LIMIT 1)) ORDER BY r.id`,[siteId]);
  try{while(true){const runRows=(await client.query(`FETCH FORWARD 100 FROM ${runs}`)).rows;if(!runRows.length)break;
   for(const run of runRows){
    const migrated=(await client.query("SELECT EXISTS(SELECT 1 FROM analytics_header_runs WHERE site_id=$1 AND run_id=$2 AND state='complete') AS migrated",[siteId,run.id])).rows[0].migrated;
    const strict=(await client.query("SELECT body_mode='strict' AS strict FROM canonical_event_authority WHERE site_id=$1",[siteId])).rows[0]?.strict;
    if(strict&&!migrated)throw Error('SESSION_HEADER_SOURCE_NOT_MIGRATED');
    async function stage(rows:SessionEventHeaderRecord[]){
     if(rows.length>100)throw Error('SESSION_HEADER_BATCH_LIMIT');
     if(rows.some(row=>row.run_id!==run.id))throw Error('SESSION_HEADER_RUN_SCOPE');
     await verifySessionEventHeaderRecords(client,siteId,rows);
     if(rows.length)await client.query(`INSERT INTO ${table} SELECT * FROM jsonb_to_recordset($1) h(run_id uuid,event_id uuid,session_id uuid,visitor_id text,event_ts timestamptz,page_id uuid,event_type text,event_path text,dimensions jsonb,reducer_payload jsonb,body_seal text)`,[JSON.stringify(rows)]);
    }
    if(migrated){for await(const rows of store.streamRows(client,siteId,run.id))await stage(rows);}
    else{
     const old=`header_old_${randomUUID().replaceAll('-','')}`;
     await client.query(`DECLARE ${old} NO SCROLL CURSOR FOR SELECT * FROM analytics_session_event_headers WHERE run_id=$1 ORDER BY event_id`,[run.id]);
     try{while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${old}`)).rows as SessionEventHeaderRecord[];if(!rows.length)break;await stage(rows);}}finally{await client.query(`CLOSE ${old}`);}
    }
   }
  }}finally{await client.query(`CLOSE ${runs}`);}
  if((await client.query('SELECT epoch::text FROM aggregation_state WHERE site_id=$1',[siteId])).rows[0]?.epoch!==epoch)throw Error('SESSION_HEADER_SOURCE_FENCE');
  await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT e.* FROM ${table} e WHERE ${sessionContributionPredicate} AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=$1 AND t.visitor_id=e.visitor_id) AND NOT EXISTS(SELECT 1 FROM identity_tombstones t WHERE t.site_id=$1 AND t.visitor_id=e.visitor_id AND t.started_at<=e.event_ts AND t.ended_at>e.event_ts) ORDER BY e.visitor_id,e.event_ts,e.event_id,e.run_id`,[siteId]);opened=true;
  while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows as SessionEventHeaderRecord[];if(!rows.length)break;
   yield rows.map(row=>({site_id:siteId,event_id:row.event_id,visitor_id:row.visitor_id,page_id:row.page_id,ts:new Date(row.event_ts).toISOString(),type:row.event_type,path:row.event_path,dimensions:row.dimensions,payload:row.reducer_payload}));
  }
 }finally{
  // On a failed SQL statement the caller must roll back; ON COMMIT DROP still
  // guarantees cleanup when the transaction ends without masking its error.
  if(opened)await client.query(`CLOSE ${cursor}`).catch(()=>undefined);
  await client.query(`DROP TABLE IF EXISTS ${table}`).catch(()=>undefined);
 }
}
