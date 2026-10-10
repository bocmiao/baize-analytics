import {canonical} from './security.js';
import {randomUUID,createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {streamSelectedHeaders} from './session-header-source.js';
import {streamSiteEventBatches} from './event-store.js';
import {sessionReducerEvent} from './session-event-headers.js';
import {reduceSessionPrefix} from './session-prefix-reducer.js';
import {sessionTimeoutMs,type AnalyticsEvent,type GoalDefinition,type FunnelDefinition} from './analytics.js';
import type {CarryCheckpoint} from './session-carry.js';
import {publishRemainingFactBodies} from './remaining-fact-publication.js';
import type {ClickHouseRemainingFactStore,RemainingFactFence} from './remaining-fact-store.js';
import {getSessionHeaderStore,type HeaderSegment} from './session-header-store.js';
import {getFactStore} from './fact-store.js';
import {getCacheStore} from './cache-store.js';
import {publishRunHeaders} from './session-header-publication.js';
import {publishRunFactBodies} from './fact-store-publication.js';

/** Before any physical ACK, reconstruct a replacement from authenticated
 * complete session topology. The caller verifies the old checkpoint envelope
 * and owns P -> site -> header locks. This does not publish heads or delete.
 * Empty survivors are explicit; no synthetic anonymous anchor is invented. */
export async function stageCarryDeletionReplacement(client:PoolClient,pool:Pool,store:ClickHouseRemainingFactStore,siteId:string,old:CarryCheckpoint,segments:HeaderSegment[],fence:RemainingFactFence,options:{replacementRunId?:string;expectedCheckpointChecksum?:string}={}){
 const site=(await client.query('SELECT s.*,a.epoch,a.generation FROM sites s JOIN aggregation_state a ON a.site_id=s.id WHERE s.id=$1',[siteId])).rows[0];
 if(!site||old.visitorId!==segments[0]?.visitorId||segments.some(s=>s.visitorId!==old.visitorId))throw Error('CARRY_REPLACEMENT_SCOPE_INVALID');
 const name=`carry_replace_${randomUUID().replaceAll('-','')}`,cursor=`carry_replace_cursor_${randomUUID().replaceAll('-','')}`;
 await client.query(`CREATE TEMP TABLE ${name}(event_id uuid PRIMARY KEY,ts timestamptz,body jsonb) ON COMMIT DROP`);
 const insert=async(batch:AnalyticsEvent[],replace:boolean)=>{
  const selected=batch.filter(e=>e.visitor_id===old.visitorId&&+new Date(e.ts)>=+new Date(old.state.startedAt)&&+new Date(e.ts)<=+new Date(old.through)).map(sessionReducerEvent);
  if(selected.length)await client.query(`INSERT INTO ${name} SELECT (x->>'event_id')::uuid,(x->>'ts')::timestamptz,x FROM jsonb_array_elements($1::jsonb)x ON CONFLICT(event_id) ${replace?'DO UPDATE SET ts=excluded.ts,body=excluded.body':'DO NOTHING'}`,[JSON.stringify(selected)]);
 };
 try{
  for await(const batch of streamSelectedHeaders(client,pool,siteId))await insert(batch,false);
  for await(const batch of streamSiteEventBatches(pool,siteId,{client,from:new Date(old.state.startedAt),to:new Date(+new Date(old.through)+1)}))await insert(batch.events,true);
  const boundaries=(await client.query(`SELECT count(*) FILTER(WHERE event_id=$1)::int anchor,count(*) FILTER(WHERE event_id=$2)::int last FROM ${name}`,[old.anchorEventId,old.lastEventId])).rows[0];
  if(!boundaries.anchor||!boundaries.last)throw Error('CARRY_REPLACEMENT_TOPOLOGY_INCOMPLETE');
  await client.query(`DELETE FROM ${name} e WHERE EXISTS(SELECT 1 FROM jsonb_to_recordset($1) s("from" timestamptz,"to" timestamptz) WHERE(s."from" IS NULL OR e.ts>=s."from")AND(s."to" IS NULL OR e.ts<s."to"))`,[JSON.stringify(segments.map(s=>({from:s.from??null,to:s.to==='infinity'?null:s.to??null})))]);
  if(!(await client.query(`SELECT 1 FROM ${name} LIMIT 1`)).rowCount)return {runId:null,checkpoint:null};
  const runId=options.replacementRunId??randomUUID(),authority=(await client.query('SELECT authority,epoch,deletion_epoch FROM canonical_event_authority WHERE site_id=$1',[siteId])).rows[0];
  if(!options.replacementRunId)await client.query("INSERT INTO analytics_fact_runs(id,site_id,epoch,generation,outbox_high_watermark,status,source_authority,canonical_epoch,canonical_deletion_epoch)VALUES($1,$2,$3,$4,0,'staging',$5,$6,$7)",[runId,siteId,site.epoch,site.generation,authority?.authority??'postgres',authority?.authority==='clickhouse'?authority.epoch:null,authority?.authority==='clickhouse'?authority.deletion_epoch:null]);
  else if(!(await client.query("SELECT 1 FROM analytics_fact_runs WHERE id=$1 AND site_id=$2 AND epoch=$3 AND status='staging'",[runId,siteId,site.epoch])).rowCount)throw Error('CARRY_REPLACEMENT_RUN_INVALID');
  const goals=(await client.query('SELECT * FROM goals WHERE site_id=$1',[siteId])).rows as GoalDefinition[],funnels=(await client.query('SELECT * FROM funnels WHERE site_id=$1',[siteId])).rows as FunnelDefinition[];
  await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT body FROM ${name} ORDER BY ts,event_id`);
  let reduced:Awaited<ReturnType<typeof reduceSessionPrefix>>;
  try{const source=async function*(){while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows;if(!rows.length)break;for(const r of rows)yield r.body as AnalyticsEvent;}};
   reduced=await reduceSessionPrefix(client,{siteId,runId,visitorId:old.visitorId,timezone:site.timezone,privacyMode:site.privacy_mode,timeoutMs:sessionTimeoutMs(site.config),goals,funnels,ignorePublishedSeed:true},source());
  }finally{await client.query(`CLOSE ${cursor}`);}
  if(options.expectedCheckpointChecksum&&(!reduced.checkpoint||createHash('sha256').update(canonical({siteId,...reduced.checkpoint})).digest('hex')!==options.expectedCheckpointChecksum))throw Error('CARRY_REPLACEMENT_RECOVERY_CHECKSUM_MISMATCH');
  // This controlled reducer emits only checkpoint/key state. Its input is
  // authenticated surviving topology, not a new event-contribution owner.
  // Complete every selected-run kind using the ordinary bounded producers;
  // absent PG bodies alone are never imported as a guessed legacy zero.
  const headers=getSessionHeaderStore(pool),facts=getFactStore(pool),cache=getCacheStore(pool),strict=authority?.authority==='clickhouse'&&(await client.query("SELECT body_mode='strict' strict FROM canonical_event_authority WHERE site_id=$1",[siteId])).rows[0]?.strict===true;
  if(strict&&(!headers||!facts||!cache))throw Error('CARRY_REPLACEMENT_STRICT_STORE_REQUIRED');
  const unexpected=(await client.query('SELECT 1 FROM analytics_effect_facts WHERE run_id=$1 UNION ALL SELECT 1 FROM analytics_vital_samples WHERE run_id=$1 UNION ALL SELECT 1 FROM analytics_session_event_headers WHERE run_id=$1 UNION ALL SELECT 1 FROM analytics_vitals_facts WHERE run_id=$1 LIMIT 1',[runId])).rowCount;
  if(unexpected)throw Error('CARRY_REPLACEMENT_UNEXPECTED_EVENT_CONTRIBUTIONS');
  if(headers){
   // Signed rollback recovery reuses the original run identity/source epoch.
   // Fresh live authorization stays in the callback; do not rewrite captured
   // source provenance merely because the deletion barrier advanced.
   const original=(await client.query('SELECT source_authority,canonical_epoch,canonical_deletion_epoch::text deletion FROM analytics_fact_runs WHERE id=$1 AND site_id=$2',[runId,siteId])).rows[0];
   if(!original||original.source_authority!=='clickhouse'||original.canonical_epoch!==authority?.epoch||BigInt(original.deletion)>BigInt(String(authority.deletion_epoch)))throw Error('CARRY_REPLACEMENT_ORIGINAL_SOURCE_FENCE');
   await publishRunHeaders(client,headers,siteId,runId,{...fence,expectedCanonicalEpoch:original.canonical_epoch,expectedDeletionEpoch:original.deletion});
  }
  if(facts)await publishRunFactBodies(client,facts,siteId,runId,fence);
  if(cache)await cache.completeOwnerKind(client,siteId,runId,'legacy_centroid',0,{...fence,expectedGeneration:String(site.generation)});
  await publishRemainingFactBodies(client,store,siteId,runId,fence);
  await client.query("UPDATE analytics_fact_runs SET status='ready',source_events=$2 WHERE id=$1",[runId,reduced.processed]);
  return {runId,checkpoint:reduced.checkpoint};
 }finally{await client.query(`DROP TABLE IF EXISTS ${name}`);}
}
