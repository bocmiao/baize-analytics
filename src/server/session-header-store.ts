import {statsReadSignal,budgetStatsSelectResponse} from './stats-read-budget.js';
import {configureClickHouseSelect,parseClickHouseSelectJson} from './clickhouse-select-budget.js';
import {measurePerformanceStage} from './performance-observation.js';
import {readObservedClickHouseBody} from './clickhouse-observed-body.js';
import {consumeClickHouseCommand} from './clickhouse-command-response.js';
import {createHash,randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import type {ClickHouseStoreConfig} from './clickhouse-store.js';
import {verifySessionEventHeaderRecords,type SessionEventHeaderRecord} from './session-event-headers.js';
import {canonical} from './security.js';
import {lockSite} from './db.js';

export interface SessionHeaderStageFence {
 expectedAggregationEpoch:string;
 expectedCanonicalEpoch?:string;
 expectedDeletionEpoch?:string;
 /** Must use the caller's independent RC lease client, never a second pool loan. */
 verifyLiveFence:()=>Promise<void>;
}
export interface HeaderSegment {visitorId:string;from?:string|Date;to?:string|Date|null}
export interface HeaderReadOptions {sessionId?:string;from?:string|Date;to?:string|Date}
const stores=new WeakMap<Pool,ClickHouseSessionHeaderStore>();
export function installSessionHeaderStore(pool:Pool,store:ClickHouseSessionHeaderStore|null){if(store)stores.set(pool,store);else stores.delete(pool);}
export function getSessionHeaderStore(pool:Pool){return stores.get(pool);}
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const time=(value:string|Date)=>new Date(value).toISOString();
const headerKeys=new Set(['run_id','event_id','session_id','visitor_id','event_ts','page_id','event_type','event_path','dimensions','reducer_payload','body_seal']);
export function sessionHeaderBody(row:SessionEventHeaderRecord){
 if(Object.keys(row).some(key=>!headerKeys.has(key))||Object.keys(row).length!==headerKeys.size)throw Error('SESSION_HEADER_RECORD_SHAPE');
 return canonical({...row,event_ts:time(row.event_ts)});
}
/** All writers and deleters hold this until their PostgreSQL transaction ends.
 * Worker P -> header; deletion P -> site -> header. No session lock or pool loan.
 */
export async function lockSessionHeaders(client:PoolClient,siteId:string){await client.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema()||':baize:session-headers:'||$1,92834117))",[siteId]);}

export class ClickHouseSessionHeaderStore {
 constructor(private readonly config:ClickHouseStoreConfig){}
 private async request(query:string,params:Record<string,string>={},body?:string,operation?:'select'){
  const url=new URL(this.config.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('SESSION_HEADER_ENDPOINT_INVALID');
  url.searchParams.set('query',query);if(operation==='select')configureClickHouseSelect(url,this.config.timeoutMs??30000);for(const [key,value]of Object.entries(params))url.searchParams.set('param_'+key,value);
  const response=await(this.config.fetch??fetch)(url,{method:'POST',headers:{'X-ClickHouse-User':this.config.username,'X-ClickHouse-Key':this.config.password},body,signal:statsReadSignal(AbortSignal.timeout(this.config.timeoutMs??30000))});
  if(!response.ok){await response.body?.cancel();throw Error('SESSION_HEADER_CH_UNAVAILABLE');}return operation==='select'?budgetStatsSelectResponse(response):response;
 }
 private selectRequest(query:string,params:Record<string,string>={}){return this.request(query,params,undefined,'select');}
 private async command(query:string,params:Record<string,string>={},body?:string){await measurePerformanceStage('ch_transport',async()=>{const response=await this.request(query,params,body);await consumeClickHouseCommand(response,'SESSION_HEADER_CH_UNAVAILABLE');},{batches:1,adapter:'session_headers'});}
 private async rows(query:string,params:Record<string,string>={}){
  const text=await readObservedClickHouseBody(()=>this.selectRequest(query+' FORMAT JSON',params),16*1024*1024,'SESSION_HEADER_CH_UNAVAILABLE','SESSION_HEADER_READ_LIMIT','session_headers');
  return (parseClickHouseSelectJson(text) as {data:{body:string;body_hash:string;event_id:string}[]}).data;
 }
 async assertEmptyRun(siteId:string,runId:string){
  const response=await this.selectRequest('SELECT count() n FROM baize_session_headers_v1 WHERE site_id={site:String} AND run_id={run:UUID} FORMAT JSON',{site:siteId,run:runId});
  if(Number((await response.json() as {data:{n:string}[]}).data[0]?.n)!==0)throw Error('SESSION_HEADER_TARGET_NOT_EMPTY');
 }
 async initialize(){await this.command("CREATE TABLE IF NOT EXISTS baize_session_headers_v1(site_id String,run_id UUID,attempt_id UUID,event_id UUID,visitor_id String,event_ts DateTime64(3,'UTC'),session_id UUID,body String,body_hash String) ENGINE=MergeTree PARTITION BY toDate(event_ts) ORDER BY(site_id,run_id,attempt_id,event_ts,event_id)");}
 /** A producer must explicitly finish its actual topology cursor, including zero rows. */
 async completeRun(client:PoolClient,siteId:string,runId:string,expectedRows:number,fence:SessionHeaderStageFence){return this.finishRun(client,siteId,runId,expectedRows,fence,false);}
 /** Recovery caller authenticates the signed source certificate and isolated target first. */
 async restoreCompletion(client:PoolClient,siteId:string,runId:string,expectedRows:number,fence:SessionHeaderStageFence,assertSignedIsolatedTarget:()=>Promise<void>){await assertSignedIsolatedTarget();return this.finishRun(client,siteId,runId,expectedRows,fence,true);}
 private async finishRun(client:PoolClient,siteId:string,runId:string,expectedRows:number,fence:SessionHeaderStageFence,allowPublished:boolean){
  if(!Number.isSafeInteger(expectedRows)||expectedRows<0)throw Error('SESSION_HEADER_COMPLETION_SCOPE');
  await lockSessionHeaders(client,siteId);await fence.verifyLiveFence();
  const run=(await client.query("SELECT epoch::text,status,canonical_epoch::text,canonical_deletion_epoch::text FROM analytics_fact_runs WHERE id=$1 AND site_id=$2",[runId,siteId])).rows[0];
  if(!run||run.epoch!==fence.expectedAggregationEpoch||!(allowPublished?['staging','ready','published']:['staging','ready']).includes(run.status)||(fence.expectedCanonicalEpoch!==undefined&&run.canonical_epoch!==fence.expectedCanonicalEpoch)||(fence.expectedDeletionEpoch!==undefined&&run.canonical_deletion_epoch!==fence.expectedDeletionEpoch))throw Error('SESSION_HEADER_COMPLETION_FENCE');
  const count=Number((await client.query('SELECT count(*)::text AS n FROM analytics_header_members WHERE run_id=$1',[runId])).rows[0].n);
  if(count!==expectedRows)throw Error('SESSION_HEADER_COMPLETION_COUNT');
  const written=await client.query("INSERT INTO analytics_header_runs(run_id,site_id,state,aggregation_epoch,canonical_epoch,deletion_epoch,row_count) VALUES($1,$2,'complete',$3,$4,$5,$6) ON CONFLICT(run_id) DO UPDATE SET state='complete',aggregation_epoch=excluded.aggregation_epoch,canonical_epoch=excluded.canonical_epoch,deletion_epoch=excluded.deletion_epoch,row_count=excluded.row_count WHERE analytics_header_runs.site_id=excluded.site_id",[runId,siteId,fence.expectedAggregationEpoch,fence.expectedCanonicalEpoch??null,fence.expectedDeletionEpoch??null,count]);
  if(written.rowCount!==1)throw Error('SESSION_HEADER_COMPLETION_FENCE');
 }
 async stageRows(client:PoolClient,siteId:string,runId:string,rows:SessionEventHeaderRecord[],fence:SessionHeaderStageFence){return this.writeRows(client,siteId,runId,rows,fence,false);}
 /** In-place legacy migration authenticates the original published PG body,
  * never uses the isolated-restore permission to invent a source row. */
 async migratePublishedRows(client:PoolClient,siteId:string,runId:string,rows:SessionEventHeaderRecord[],fence:SessionHeaderStageFence){
  if(rows.length>200)throw Error('SESSION_HEADER_STAGE_SCOPE');await lockSessionHeaders(client,siteId);await fence.verifyLiveFence();
  const run=(await client.query("SELECT 1 FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id WHERE r.id=$1 AND r.site_id=$2 AND r.status='published' AND r.epoch=a.epoch AND r.epoch=$3 AND r.generation<=a.processed_generation",[runId,siteId,fence.expectedAggregationEpoch])).rowCount;
  if(!run)throw Error('SESSION_HEADER_MIGRATION_FENCE');
  const original=(await client.query('SELECT * FROM analytics_session_event_headers WHERE run_id=$1 AND event_id=ANY($2::uuid[])',[runId,rows.map(row=>row.event_id)])).rows as SessionEventHeaderRecord[];
  const expected=new Map(original.map(row=>[row.event_id,sessionHeaderBody(row)]));
  if(original.length!==rows.length||rows.some(row=>expected.get(row.event_id)!==sessionHeaderBody(row)))throw Error('SESSION_HEADER_MIGRATION_BODY_MISMATCH');
  const source=(await client.query('SELECT canonical_epoch::text,canonical_deletion_epoch::text FROM analytics_fact_runs WHERE id=$1 AND site_id=$2',[runId,siteId])).rows[0];
  return this.writeRows(client,siteId,runId,rows,{...fence,expectedCanonicalEpoch:source.canonical_epoch??undefined,expectedDeletionEpoch:source.canonical_deletion_epoch??undefined},true);
 }
 async completePublishedRun(client:PoolClient,siteId:string,runId:string,expectedRows:number,fence:SessionHeaderStageFence){
  const count=Number((await client.query('SELECT count(*)::text n FROM analytics_session_event_headers WHERE run_id=$1',[runId])).rows[0].n);
  if(count!==expectedRows)throw Error('SESSION_HEADER_MIGRATION_BODY_MISMATCH');
  const source=(await client.query('SELECT canonical_epoch::text,canonical_deletion_epoch::text FROM analytics_fact_runs WHERE id=$1 AND site_id=$2',[runId,siteId])).rows[0];
  if(!source)throw Error('SESSION_HEADER_MIGRATION_FENCE');
  return this.finishRun(client,siteId,runId,expectedRows,{...fence,expectedCanonicalEpoch:source.canonical_epoch??undefined,expectedDeletionEpoch:source.canonical_deletion_epoch??undefined},true);
 }
 /** Isolated restore only: authenticate producer seals before importing/remapping
  * rows; an explicit target-isolation check prevents source namespace mutation.
  */
 async restoreRows(client:PoolClient,siteId:string,runId:string,rows:SessionEventHeaderRecord[],fence:SessionHeaderStageFence,assertIsolatedTarget:()=>Promise<void>){
  await assertIsolatedTarget();await verifySessionEventHeaderRecords(client,siteId,rows);
  await lockSessionHeaders(client,siteId);
  await client.query('DELETE FROM analytics_header_members WHERE run_id=$1 AND event_id=ANY($2::uuid[])',[runId,rows.map(row=>row.event_id)]);
  return this.writeRows(client,siteId,runId,rows,fence,true);
 }
 scopeIdentity(){const url=new URL(this.config.url);return digest(canonical([url.origin,url.pathname,url.searchParams.get('database')??'default']));}
 private async writeRows(client:PoolClient,siteId:string,runId:string,rows:SessionEventHeaderRecord[],fence:SessionHeaderStageFence,allowPublished:boolean){
  if(!rows.length)return {staged:0};if(rows.length>200||new Set(rows.map(row=>row.event_id.toLowerCase())).size!==rows.length||rows.some(row=>row.run_id!==runId))throw Error('SESSION_HEADER_STAGE_SCOPE');
  await lockSessionHeaders(client,siteId);await fence.verifyLiveFence();await verifySessionEventHeaderRecords(client,siteId,rows);
  const run=(await client.query("SELECT r.epoch::text,r.status FROM analytics_fact_runs r WHERE r.id=$1 AND r.site_id=$2",[runId,siteId])).rows[0];
  if(!run||run.epoch!==fence.expectedAggregationEpoch||!(allowPublished?['staging','ready','published']:['staging','ready']).includes(run.status))throw Error('SESSION_HEADER_STAGE_FENCE');
  const input=rows.map(row=>{const body=sessionHeaderBody(row);if(Buffer.byteLength(body)>32768)throw Error('SESSION_HEADER_BODY_LIMIT');return {row,body,bodyHash:digest(body)};}).sort((a,b)=>a.row.event_id.localeCompare(b.row.event_id));
  // Repeated producer flushes may reuse an identical event, but never overwrite it.
  const existing=(await client.query('SELECT event_id,body_hash FROM analytics_header_members WHERE run_id=$1 AND event_id=ANY($2::uuid[])',[runId,input.map(item=>item.row.event_id)])).rows;
  const old=new Map(existing.map(row=>[row.event_id,row.body_hash]));for(const item of input)if(old.has(item.row.event_id)&&old.get(item.row.event_id)!==item.bodyHash)throw Error('SESSION_HEADER_EVENT_CONFLICT');
  const fresh=input.filter(item=>!old.has(item.row.event_id));if(!fresh.length)return {staged:0};
  const attempt=randomUUID(),batch=randomUUID(),checksum=digest(fresh.map(item=>item.bodyHash).join('\n'));
  await this.command('INSERT INTO baize_session_headers_v1 FORMAT JSONEachRow',{},fresh.map(item=>JSON.stringify({site_id:siteId,run_id:runId,attempt_id:attempt,event_id:item.row.event_id,visitor_id:item.row.visitor_id,event_ts:time(item.row.event_ts).replace('T',' ').replace('Z',''),session_id:item.row.session_id,body:item.body,body_hash:item.bodyHash})).join('\n'));
  const verified=await this.rows('SELECT toString(event_id) event_id,body,body_hash FROM baize_session_headers_v1 WHERE site_id={site:String} AND attempt_id={attempt:UUID} ORDER BY toString(event_id) LIMIT 201',{site:siteId,attempt});
  if(verified.length!==fresh.length||verified.some((row,i)=>row.event_id!==fresh[i]!.row.event_id.toLowerCase()||row.body_hash!==fresh[i]!.bodyHash||digest(row.body)!==row.body_hash)||digest(verified.map(row=>row.body_hash).join('\n'))!==checksum)throw Error('SESSION_HEADER_UPLOAD_NOT_VERIFIED');
  await fence.verifyLiveFence();
  await client.query('INSERT INTO analytics_header_batches(id,site_id,run_id,attempt_id,aggregation_epoch,canonical_epoch,deletion_epoch,row_count,checksum) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[batch,siteId,runId,attempt,fence.expectedAggregationEpoch,fence.expectedCanonicalEpoch??null,fence.expectedDeletionEpoch??null,fresh.length,checksum]);
  for(const item of fresh)await client.query('INSERT INTO analytics_header_members(run_id,event_id,batch_id,body_hash,visitor_id,event_ts,session_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[runId,item.row.event_id,batch,item.bodyHash,item.row.visitor_id,item.row.event_ts,item.row.session_id]);
  return {staged:fresh.length,attemptId:attempt};
 }
 /** No generation range is a publication whitelist. RR metadata controls exact attempts. */
 async *streamRows(client:PoolClient,siteId:string,runId:string,options:HeaderReadOptions={}):AsyncIterable<SessionEventHeaderRecord[]>{
  yield* this.readRows(client,siteId,runId,options,false);
 }
 /** Producer-only completed topology. The caller verifies its independent
  * fresh lease/authority fence; ordinary analytics never sees staging runs. */
 async *streamCompletedProducerRows(client:PoolClient,siteId:string,runId:string,fence:SessionHeaderStageFence,options:HeaderReadOptions={}):AsyncIterable<SessionEventHeaderRecord[]>{
  await lockSessionHeaders(client,siteId);await fence.verifyLiveFence();
  const state=(await client.query("SELECT r.status,r.epoch::text,r.canonical_epoch::text,r.canonical_deletion_epoch::text,h.row_count::text FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id JOIN analytics_header_runs h ON h.run_id=r.id AND h.site_id=r.site_id WHERE r.id=$1 AND r.site_id=$2 AND r.status IN('staging','ready') AND r.epoch=a.epoch AND h.state='complete' AND h.aggregation_epoch=r.epoch AND h.canonical_epoch IS NOT DISTINCT FROM r.canonical_epoch AND h.deletion_epoch IS NOT DISTINCT FROM r.canonical_deletion_epoch",[runId,siteId])).rows[0];
  if(!state||state.epoch!==fence.expectedAggregationEpoch||(fence.expectedCanonicalEpoch!==undefined&&state.canonical_epoch!==fence.expectedCanonicalEpoch)||(fence.expectedDeletionEpoch!==undefined&&state.canonical_deletion_epoch!==fence.expectedDeletionEpoch))throw Error('SESSION_HEADER_PRODUCER_SOURCE_FENCE');
  const count=(await client.query('SELECT count(*)::text n FROM analytics_header_members WHERE run_id=$1',[runId])).rows[0].n;
  if(count!==state.row_count)throw Error('SESSION_HEADER_COMPLETION_COUNT');
  yield* this.readRows(client,siteId,runId,options,true);
  await fence.verifyLiveFence();
 }
 private async *readRows(client:PoolClient,siteId:string,runId:string,options:HeaderReadOptions,producer:boolean):AsyncIterable<SessionEventHeaderRecord[]>{
  const statuses=producer?"r.status IN('staging','ready')":"r.status='published'";
  const invalid=(await client.query(`SELECT 1 FROM analytics_header_batches b JOIN analytics_fact_runs r ON r.id=b.run_id JOIN aggregation_state a ON a.site_id=b.site_id WHERE b.site_id=$1 AND b.run_id=$2 AND ${statuses} AND r.epoch=a.epoch AND b.aggregation_epoch<>r.epoch LIMIT 1`,[siteId,runId])).rowCount;
  if(invalid)throw Error('SESSION_HEADER_SOURCE_FENCE');
  const cursor='header_batches_'+randomUUID().replaceAll('-','');
  await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT b.* FROM analytics_header_batches b JOIN analytics_fact_runs r ON r.id=b.run_id JOIN aggregation_state a ON a.site_id=b.site_id WHERE b.site_id=$1 AND b.run_id=$2 AND ${statuses} AND r.epoch=a.epoch AND b.aggregation_epoch=r.epoch ORDER BY b.id`,[siteId,runId]);
  try{while(true){const manifest=(await client.query(`FETCH FORWARD 1 FROM ${cursor}`)).rows[0];if(!manifest)break;
   const members=(await client.query('SELECT * FROM analytics_header_members WHERE batch_id=$1 ORDER BY event_id',[manifest.id])).rows;
   if(members.length>200)throw Error('SESSION_HEADER_MANIFEST_LIMIT');if(!members.length)continue;
   const allowed=new Map(members.map(row=>[row.event_id,row]));
   const uploaded=await this.rows('SELECT toString(event_id) event_id,body,body_hash FROM baize_session_headers_v1 WHERE site_id={site:String} AND run_id={run:UUID} AND attempt_id={attempt:UUID} ORDER BY toString(event_id) LIMIT 201',{site:siteId,run:runId,attempt:manifest.attempt_id});
   if(uploaded.length>200)throw Error('SESSION_HEADER_BATCH_CORRUPT');const found=new Set<string>();let result:SessionEventHeaderRecord[]=[];
   for(const row of uploaded){const receipt=allowed.get(row.event_id);if(!receipt)continue;if(found.has(row.event_id)||digest(row.body)!==row.body_hash||row.body_hash!==receipt.body_hash)throw Error('SESSION_HEADER_BODY_UNAVAILABLE');found.add(row.event_id);
    const header=JSON.parse(row.body) as SessionEventHeaderRecord;if(sessionHeaderBody(header)!==row.body)throw Error('SESSION_HEADER_RECORD_SHAPE');if(header.run_id!==runId||header.event_id.toLowerCase()!==row.event_id||header.visitor_id!==receipt.visitor_id||header.session_id!==receipt.session_id||time(header.event_ts)!==time(receipt.event_ts))throw Error('SESSION_HEADER_BODY_UNAVAILABLE');
    if(options.sessionId&&header.session_id!==options.sessionId||options.from&&+new Date(header.event_ts)<+new Date(options.from)||options.to&&+new Date(header.event_ts)>=+new Date(options.to))continue;
    result.push(header);if(result.length===100){await measurePerformanceStage('authentication',()=>verifySessionEventHeaderRecords(client,siteId,result),{rows:result.length,adapter:'session_headers'});yield result;result=[];}
   }
   if(found.size!==members.length)throw Error('SESSION_HEADER_BODY_UNAVAILABLE');if(result.length){await measurePerformanceStage('authentication',()=>verifySessionEventHeaderRecords(client,siteId,result),{rows:result.length,adapter:'session_headers'});yield result;}
  }}finally{await client.query(`CLOSE ${cursor}`);}
 }
 async eraseSegments(client:PoolClient,siteId:string,segments:HeaderSegment[]){
  if(segments.length>1000||segments.some(segment=>!segment.visitorId))throw Error('SESSION_HEADER_DELETE_SCOPE');await lockSessionHeaders(client,siteId);
  for(const segment of segments){const params:Record<string,string>={site:siteId,visitor:segment.visitorId},clauses=['site_id={site:String}','visitor_id={visitor:String}'];if(segment.from){params.from=time(segment.from).replace('T',' ').replace('Z','');clauses.push("event_ts>={from:DateTime64(3,'UTC')}");}if(segment.to){params.to=time(segment.to).replace('T',' ').replace('Z','');clauses.push("event_ts<{to:DateTime64(3,'UTC')}");}const where=clauses.join(' AND ');
   await this.command('ALTER TABLE baize_session_headers_v1 DELETE WHERE '+where+' SETTINGS mutations_sync=2',params);
   const response=await this.selectRequest('SELECT count() n FROM baize_session_headers_v1 WHERE '+where+' FORMAT JSON',params);if(Number((await response.json() as {data:{n:string}[]}).data[0]?.n)!==0)throw Error('SESSION_HEADER_DELETE_NOT_ACKNOWLEDGED');
   await client.query('DELETE FROM analytics_header_members m USING analytics_fact_runs r WHERE r.id=m.run_id AND r.site_id=$1 AND m.visitor_id=$2 AND ($3::timestamptz IS NULL OR m.event_ts>=$3) AND ($4::timestamptz IS NULL OR m.event_ts<$4)',[siteId,segment.visitorId,segment.from??null,segment.to??null]);
  }await client.query('UPDATE analytics_header_runs h SET row_count=(SELECT count(*) FROM analytics_header_members m WHERE m.run_id=h.run_id) WHERE h.site_id=$1',[siteId]);return {physicalAck:true};
 }
 /** Recover orphan uploads after worker/PG failure without an unbounded list.
  * The durable cursor wraps when exhausted; active uploads hold the same gate.
  * A committed receipt protects each attempt, including not-yet-published ready runs.
  */
 async pruneOrphans(client:PoolClient,siteId:string){
  await lockSite(client,siteId);await lockSessionHeaders(client,siteId);
  const position=(await client.query('SELECT next_attempt_id FROM analytics_header_gc WHERE site_id=$1 FOR UPDATE',[siteId])).rows[0]?.next_attempt_id??'';
  const candidates=await this.rows('SELECT DISTINCT toString(attempt_id) event_id FROM baize_session_headers_v1 WHERE site_id={site:String} AND toString(attempt_id)>{after:String} ORDER BY event_id LIMIT 1001',{site:siteId,after:position});
  const selected=candidates.slice(0,1000).map(row=>row.event_id);
  const committed=(await client.query('SELECT attempt_id FROM analytics_header_batches WHERE site_id=$1 AND attempt_id=ANY($2::uuid[])',[siteId,selected])).rows;
  const keep=new Set(committed.map(row=>row.attempt_id));const orphan=selected.filter(id=>!keep.has(id));
  if(orphan.length){
   // UUIDs come from a typed CH column, not request SQL. Bound transport/state to1000.
   if(orphan.some(id=>!(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).test(id)))throw Error('SESSION_HEADER_ATTEMPT_INVALID');
   const params={site:siteId,attempts:'['+orphan.map(id=>"'"+id+"'").join(',')+']'};
   const where='site_id={site:String} AND attempt_id IN {attempts:Array(UUID)}';
   await this.command('ALTER TABLE baize_session_headers_v1 DELETE WHERE '+where+' SETTINGS mutations_sync=2',params);
   const response=await this.selectRequest('SELECT count() n FROM baize_session_headers_v1 WHERE '+where+' FORMAT JSON',params);
   if(Number((await response.json() as {data:{n:string}[]}).data[0]?.n)!==0)throw Error('SESSION_HEADER_ORPHAN_NOT_ACKNOWLEDGED');
  }
  const next=candidates.length>1000?selected[999]!:null;
  await client.query('INSERT INTO analytics_header_gc(site_id,next_attempt_id,last_success_at) VALUES($1,$2,now()) ON CONFLICT(site_id) DO UPDATE SET next_attempt_id=excluded.next_attempt_id,last_success_at=now(),last_error_code=NULL,updated_at=now()',[siteId,next]);
  return {removedAttempts:orphan.length,remaining:candidates.length>1000};
 }
}

/** At most one site/1000 attempts per maintenance minute, persisted fair order.
 * Failed sweeps keep their cursor and expose a safe retry status without blocking
 * reports/retention forever or reborrowing the connection while holding a gate.
 */
export async function cleanupSessionHeaderOrphans(pool:Pool){
 const store=getSessionHeaderStore(pool);if(!store)return {skipped:true};
 const client=await pool.connect();let siteId:string|undefined;
 try{await client.query('BEGIN');siteId=(await client.query('SELECT s.id FROM sites s LEFT JOIN analytics_header_gc g ON g.site_id=s.id ORDER BY g.updated_at ASC NULLS FIRST,s.id LIMIT 1')).rows[0]?.id;if(!siteId){await client.query('COMMIT');return {skipped:true};}const result=await store.pruneOrphans(client,siteId);await client.query('COMMIT');return result;}
 catch{await client.query('ROLLBACK');if(siteId)await client.query("INSERT INTO analytics_header_gc(site_id,last_error_code) VALUES($1,'session_header_gc_failed') ON CONFLICT(site_id) DO UPDATE SET last_error_code=excluded.last_error_code,updated_at=now()",[siteId]);return {failed:true};}
 finally{client.release();}
}
