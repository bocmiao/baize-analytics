import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {canonical} from './security.js';
import type {ClickHouseFactStore,FactStoreKind} from './fact-store.js';
import type {ClickHouseRemainingFactStore} from './remaining-fact-store.js';
import type {RemainingFactKind} from './remaining-fact-record.js';

const tables={effects:'analytics_effect_facts',vitals:'analytics_vital_samples',sessions:'analytics_session_facts',numerics:'analytics_numeric_facts',members:'analytics_member_facts',carry_checkpoints:'analytics_carry_checkpoints',carry_keys:'analytics_carry_keys'} as const;
type BodyKind=keyof typeof tables;
function normalized(kind:BodyKind,input:unknown){
 const row={...(input as Record<string,unknown>)};
 for(const key of ['event_ts','through_ts','first_ts','last_ts'])if(Object.hasOwn(row,key))row[key]=new Date(row[key] as string).toISOString();
 if(kind==='sessions'){const data={...(row.data as Record<string,unknown>)};for(const key of['started_at','last_active'])data[key]=new Date(data[key] as string).toISOString();row.data=data;}
 if(kind==='carry_checkpoints'){const state={...(row.state as Record<string,unknown>)};for(const key of['startedAt','lastActive','firstPageAt','lastPageAt'])if(Object.hasOwn(state,key))state[key]=new Date(state[key] as string).toISOString();row.state=state;}
 return row;
}
const hash=(kind:BodyKind,row:unknown)=>createHash('sha256').update(canonical(normalized(kind,row))).digest('hex');
/** Exact original-row multiset comparison with spill-backed SQL hashes. CH
 * readers verify committed-attempt membership, private HMAC and body hashes.
 * Already pruned PG bodies are explicit, never a fictitious equality result.
 * The caller owns P/site/header gates and a captured published run fence. */
export async function verifyPublishedFactBodies(client:PoolClient,siteId:string,runId:string,stores:{facts:ClickHouseFactStore;remaining:ClickHouseRemainingFactStore}){
 const run=(await client.query("SELECT 1 FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id WHERE r.id=$1 AND r.site_id=$2 AND r.status='published' AND r.epoch=a.epoch",[runId,siteId])).rowCount;
 if(!run)throw Error('FACT_BODY_VERIFICATION_FENCE');
 const result:Partial<Record<BodyKind,{rows:number;pgRows:number;status:'equal'|'already_pruned'}>>={};
 for(const kind of Object.keys(tables) as BodyKind[]){
  const marker=kind==='effects'||kind==='vitals'?'analytics_fact_store_runs':'analytics_remaining_fact_runs';
  if(!(await client.query(`SELECT 1 FROM ${marker} WHERE site_id=$1 AND run_id=$2 AND kind=$3 AND state='complete'`,[siteId,runId,kind])).rowCount)throw Error('FACT_BODY_KIND_INCOMPLETE');
  const stage=`fact_verify_${randomUUID().replaceAll('-','')}`,cursor=`fact_verify_cursor_${randomUUID().replaceAll('-','')}`;
  await client.query(`CREATE TEMP TABLE ${stage}(hash text PRIMARY KEY,n bigint NOT NULL) ON COMMIT DROP`);
  let pgRows=0,chRows=0;
  try{
   await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT to_jsonb(r) body FROM ${tables[kind]} r WHERE run_id=$1`,[runId]);
   try{while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows;if(!rows.length)break;pgRows+=rows.length;await client.query(`INSERT INTO ${stage} SELECT hash,count(*) FROM unnest($1::text[]) hash GROUP BY hash ON CONFLICT(hash)DO UPDATE SET n=${stage}.n+excluded.n`,[rows.map(r=>hash(kind,r.body))]);}}finally{await client.query(`CLOSE ${cursor}`);}
   const source=kind==='effects'||kind==='vitals'?stores.facts.streamRunRows(client,siteId,runId,kind as FactStoreKind):stores.remaining.streamRunRows(client,siteId,runId,kind as RemainingFactKind);
   for await(const records of source){if(records.length>100)throw Error('FACT_BODY_BATCH_LIMIT');chRows+=records.length;if(pgRows)for(const r of records){const matched=await client.query(`UPDATE ${stage} SET n=n-1 WHERE hash=$1 AND n>0 RETURNING hash`,[hash(kind,r.row)]);if(!matched.rowCount)throw Error('FACT_BODY_CHECKSUM_MISMATCH');}}
   if(pgRows&&((await client.query(`SELECT 1 FROM ${stage} WHERE n<>0 LIMIT 1`)).rowCount||chRows!==pgRows))throw Error('FACT_BODY_CHECKSUM_MISMATCH');
   result[kind]={rows:chRows,pgRows,status:pgRows?'equal':'already_pruned'};
  }finally{await client.query(`DROP TABLE IF EXISTS ${stage}`);}
 }
 return result;
}
