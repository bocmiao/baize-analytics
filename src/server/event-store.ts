import {randomUUID} from 'node:crypto';
import {beginPartitionSnapshot} from './db.js';
import type {Pool, PoolClient} from 'pg';
import type {SnapshotReadOptions,StoredEvent} from './clickhouse-store.js';
import {ClickHouseStore} from './clickhouse-store.js';
export interface EventReadOptions extends SnapshotReadOptions {client?: PoolClient}
export interface EventReadResult {events: StoredEvent[]; source: 'postgres' | 'clickhouse' | 'hybrid'; mode: string; fallbackReason?: string; generation?: string; epoch?: string; watermark?: Date | string | null; coverage: number;consistency?:'captured_pg_rr'|'verified_current_replica';replicaGeneration?:string;deltaRows?:number;capturedOutboxId?:string;retentionBoundary?:string;rangeStatus?:string;uvStatus?:string;truncated?:boolean;limit?:number}
function pgEventQuery(siteId:string,options:EventReadOptions){
  const params: unknown[] = [siteId]; const clauses = ['e.site_id=$1'];
  if (options.from) {params.push(options.from); clauses.push(`e.ts>=$${params.length}`);}
  if (options.to) {params.push(options.to); clauses.push(`e.ts<$${params.length}`);}
  if (options.type) {params.push(options.type); clauses.push(`e.type=$${params.length}`);}
  if (!options.includeBots) clauses.push('NOT e.is_bot');
  if(options.eventIds){params.push(options.eventIds);clauses.push(`e.event_id=ANY($${params.length}::uuid[])`);}
  if(options.visitorIds){params.push(options.visitorIds);clauses.push(`e.visitor_id=ANY($${params.length}::text[])`);}
  if(options.path!==undefined){params.push(options.path);clauses.push(`e.path=$${params.length}`);}
  if(options.eventName!==undefined){params.push(options.eventName);clauses.push(`e.payload->>'event_name'=$${params.length}`);}
  clauses.push('NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=e.site_id AND t.visitor_id=e.visitor_id)', 'NOT EXISTS(SELECT 1 FROM identity_tombstones t WHERE t.site_id=e.site_id AND t.visitor_id=e.visitor_id AND t.started_at<=e.ts AND t.ended_at>e.ts)');
  const limit=options.limit===undefined?'':(params.push(options.limit),`LIMIT $${params.length}`);
 return {sql:`SELECT e.* FROM events e WHERE ${clauses.join(' AND ')} ORDER BY e.ts ${options.order==='desc'?'DESC':'ASC'},e.event_id ${options.order==='desc'?'DESC':'ASC'} ${limit}`,params};
}
const stores = new WeakMap<Pool, EventStore>();
export function installEventStore(pool: Pool, store: EventStore): void {stores.set(pool, store);}
export async function readSiteEvents(pool: Pool, siteId: string, options: EventReadOptions = {}): Promise<EventReadResult> {return (stores.get(pool) || new EventStore(pool)).readSiteEvents(siteId, options);}
export class EventStore {
 constructor(private readonly pool: Pool, private readonly clickhouse?: ClickHouseStore) {}
 private async postgres(siteId: string, options: EventReadOptions, metadata: Partial<EventReadResult> = {}): Promise<EventReadResult> {
  const {sql,params}=pgEventQuery(siteId,options);const events=(await(options.client||this.pool).query(sql,params)).rows as StoredEvent[];
  return {events, mode: 'postgres', coverage: 1, ...metadata, source: 'postgres'};
 }
 async readSiteEvents(siteId:string,options:EventReadOptions={}):Promise<EventReadResult>{
  if(options.eventIds&&options.eventIds.length>1000||options.visitorIds&&options.visitorIds.length>1000)throw Error('EVENT_FILTER_LIMIT');
  if(options.limit!==undefined&&(!Number.isInteger(options.limit)||options.limit<1||options.limit>100001))throw Error('EVENT_READ_LIMIT');
  const site=(await(options.client||this.pool).query('SELECT retention_days,privacy_mode,timezone FROM sites WHERE id=$1',[siteId])).rows[0];const now=Date.now();const cutoff=now-Number(site?.retention_days??90)*86400000;const requestedFrom=options.from?+new Date(options.from):cutoff;const requestedTo=options.to?+new Date(options.to):now;const from=new Date(Math.max(requestedFrom,cutoff));const to=new Date(Math.min(requestedTo,now));const futureOnly=requestedFrom>=now;const incomplete=requestedFrom<cutoff||futureOnly;const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:site?.timezone||'UTC',year:'numeric',month:'2-digit',day:'2-digit'});const uvStatus=site?.privacy_mode==='daily_salt'&&fmt.format(from)!==fmt.format(new Date(+to-1))?'unsupported_in_this_mode':'supported';
  const result=await this.read(siteId,{...options,from,to,limit:options.limit===undefined?undefined:options.limit+1});
  const metadata={retentionBoundary:new Date(cutoff).toISOString(),rangeStatus:futureOnly?'future_only':requestedFrom<cutoff?'outside_raw_retention':requestedTo>now?'future_clamped':'complete',uvStatus};
  if(options.limit===undefined)return {...result,...metadata,coverage:incomplete?0:result.coverage};const truncated=result.events.length>options.limit;return {...result,...metadata,events:result.events.slice(0,options.limit),limit:options.limit,truncated,coverage:truncated||incomplete?0:result.coverage};
 }
 private async read(siteId: string, options: EventReadOptions): Promise<EventReadResult> {
  if (options.client) return this.postgres(siteId, options, {fallbackReason: 'transaction_snapshot_requires_postgres'});
  if (!this.clickhouse) return this.postgres(siteId, options, {fallbackReason: 'clickhouse_not_configured'});
  const state = (await this.pool.query('SELECT e.*,a.generation::text AS current_generation,a.epoch::text AS current_epoch FROM aggregation_state a LEFT JOIN event_store_state e USING(site_id) WHERE a.site_id=$1', [siteId])).rows[0];
  const meta = {mode: state?.mode || 'postgres', generation: state?.current_generation, epoch: state?.current_epoch, watermark: state?.watermark};
  const fallback = (reason: string) => this.postgres(siteId, options, {...meta, fallbackReason: reason});
  if (!state || state.mode !== 'prefer_clickhouse') return fallback(state?.mode === 'mirror' ? 'mirror_only' : 'postgres_selected');
  if (!state.snapshot_id || state.snapshot_epoch !== state.current_epoch) return fallback('mirror_epoch_mismatch');
  if(state.replica_format==='incremental_v1')return this.hybrid(siteId,options);
  if (String(state.snapshot_generation) !== String(state.current_generation)) return fallback('mirror_behind');
  const identity = {siteId, snapshotId: state.snapshot_id, epoch: state.snapshot_epoch, generation:String(state.snapshot_generation),versionMode:state.replica_format==='incremental_v1'?'at_most' as const:'exact' as const};
  try {
   // Missing/externally truncated replicas must never silently answer zero events.
   if (await this.clickhouse.countSnapshot(identity) !== Number(state.snapshot_count)) return fallback('mirror_integrity_mismatch');
   const events=await this.clickhouse.readSnapshot(identity,options);const scoped=await this.clickhouse.countSelected(identity,options);if(events.length!==Math.min(options.limit??Infinity,scoped))return fallback('mirror_integrity_mismatch');
   const current = (await this.pool.query('SELECT a.generation::text AS generation,a.epoch::text AS epoch,e.mode,e.snapshot_id FROM aggregation_state a JOIN event_store_state e USING(site_id) WHERE a.site_id=$1', [siteId])).rows[0];
   if (!current || current.epoch !== identity.epoch || current.generation !== identity.generation || current.mode !== 'prefer_clickhouse' || current.snapshot_id !== identity.snapshotId) return fallback('source_changed_during_read');
   const tombstones = (await this.pool.query('SELECT visitor_id FROM tombstones WHERE site_id=$1', [siteId])).rows;
   const segments = (await this.pool.query('SELECT visitor_id,started_at,ended_at FROM identity_tombstones WHERE site_id=$1', [siteId])).rows;
   const deleted = new Set(tombstones.map(row => row.visitor_id));
   const safe = events.filter(event => event.site_id === siteId && !deleted.has(event.visitor_id) && !segments.some(segment => segment.visitor_id === event.visitor_id && +new Date(event.ts) >= +new Date(segment.started_at) && +new Date(event.ts) < +new Date(segment.ended_at)));
   return {events: safe, source: 'clickhouse', ...meta, coverage: 1};
  } catch {return fallback('clickhouse_unavailable');}
 }
 private async hybrid(siteId:string,options:EventReadOptions):Promise<EventReadResult>{
  const client=await this.pool.connect();let reason='clickhouse_unavailable';let answer:EventReadResult|undefined;
  try{await beginPartitionSnapshot(client);const state=(await client.query('SELECT e.*,a.generation::text AS current_generation,a.epoch::text AS current_epoch FROM event_store_state e JOIN aggregation_state a USING(site_id) WHERE e.site_id=$1',[siteId])).rows[0];
   if(!state||state.mode!=='prefer_clickhouse'||state.replica_format!=='incremental_v1'||!state.snapshot_id||state.snapshot_epoch!==state.current_epoch){reason='mirror_epoch_mismatch';throw Error('REPLICA_FENCE');}
   const tail=(await client.query("SELECT COALESCE(max(o.id),0)::text id,count(*)::int n,max(o.ts) AS tail_watermark,bool_or(e.type='identify') identity_rewrite FROM outbox o JOIN events e USING(site_id,event_id,ts) WHERE o.site_id=$1 AND o.id>$2::bigint",[siteId,state.captured_outbox_id])).rows[0];
   if(tail.identity_rewrite===true||String(state.snapshot_generation)!==state.current_generation&&Number(tail.n)===0){reason='mirror_requires_rebuild';throw Error('REPLICA_FENCE');}
   const identity={siteId,snapshotId:state.snapshot_id,epoch:state.snapshot_epoch,generation:String(state.snapshot_generation),versionMode:'at_most' as const};
   if(await this.clickhouse!.countSnapshot(identity)!==Number(state.snapshot_count)){reason='mirror_integrity_mismatch';throw Error('REPLICA_FENCE');}
   const base=await this.clickhouse!.readSnapshot(identity,options);const scoped=await this.clickhouse!.countSelected(identity,options);if(base.length!==Math.min(options.limit??Infinity,scoped)){reason='mirror_integrity_mismatch';throw Error('REPLICA_FENCE');}const query=pgEventQuery(siteId,options);query.params.push(state.captured_outbox_id,tail.id);query.sql=query.sql.replace('FROM events e WHERE','FROM events e JOIN outbox o USING(site_id,event_id,ts) WHERE').replace(' ORDER BY',` AND o.id>$${query.params.length-1}::bigint AND o.id<=$${query.params.length}::bigint ORDER BY`);const delta=(await client.query(query.sql,query.params)).rows as StoredEvent[];
   const tombstones=(await client.query('SELECT visitor_id FROM tombstones WHERE site_id=$1',[siteId])).rows;const segments=(await client.query('SELECT visitor_id,started_at,ended_at FROM identity_tombstones WHERE site_id=$1',[siteId])).rows;const deleted=new Set(tombstones.map(t=>t.visitor_id));const merged=new Map([...base,...delta].map(e=>[JSON.stringify([e.event_id,+new Date(e.ts)]),e]));const safe=[...merged.values()].filter(e=>!deleted.has(e.visitor_id)&&!segments.some(t=>t.visitor_id===e.visitor_id&&+new Date(e.ts)>=+new Date(t.started_at)&&(t.ended_at===Infinity||+new Date(e.ts)<+new Date(t.ended_at))));safe.sort((a,b)=>(options.order==='desc'?-1:1)*(+new Date(a.ts)-+new Date(b.ts)||a.event_id.localeCompare(b.event_id)));
   await client.query('COMMIT');const current=(await client.query('SELECT a.epoch::text,e.mode,e.replica_format FROM aggregation_state a JOIN event_store_state e USING(site_id) WHERE site_id=$1',[siteId])).rows[0];if(!current||current.epoch!==state.current_epoch||current.mode!=='prefer_clickhouse'||current.replica_format!=='incremental_v1'){reason='source_changed_during_read';throw Error('REPLICA_FENCE');}
   answer={events:options.limit===undefined?safe:safe.slice(0,options.limit),source:Number(tail.n)?'hybrid':'clickhouse',mode:'prefer_clickhouse',consistency:'captured_pg_rr',epoch:state.current_epoch,generation:state.current_generation,replicaGeneration:String(state.snapshot_generation),capturedOutboxId:String(tail.n?tail.id:state.captured_outbox_id),deltaRows:delta.length,watermark:tail.tail_watermark&&(!state.watermark||+new Date(tail.tail_watermark)>+new Date(state.watermark))?tail.tail_watermark:state.watermark,coverage:1};
  }catch{await client.query('ROLLBACK').catch(()=>{});}finally{client.release();}
  return answer||this.postgres(siteId,options,{mode:'prefer_clickhouse',fallbackReason:reason});
 }

}

/** Temporal identity is PostgreSQL metadata even when event bodies come from ClickHouse. */
export async function readIdentityEvents(pool:Pool,siteId:string,options:EventReadOptions&{userHash?:string}={}){
 const bindings=(await (options.client||pool).query('SELECT visitor_id,user_id,started_at,ended_at FROM identity_bindings WHERE site_id=$1 AND ($2::text IS NULL OR user_id=$2) AND ($3::timestamptz IS NULL OR ended_at IS NULL OR ended_at>$3) AND ($4::timestamptz IS NULL OR started_at<$4) ORDER BY visitor_id,started_at LIMIT 1001',[siteId,options.userHash??null,options.from??null,options.to??null])).rows;
 if(bindings.length>1000)return {events:[],source:'postgres' as const,mode:'postgres',coverage:0,truncated:true,fallbackReason:'identity_binding_limit'};
 const result=await readSiteEvents(pool,siteId,{...options,visitorIds:[...new Set<string>(bindings.map(b=>b.visitor_id))]});
 const events=result.events.flatMap(e=>{const binding=bindings.find(b=>b.visitor_id===e.visitor_id&&+new Date(e.ts)>=+new Date(b.started_at)&&(b.ended_at===null||+new Date(e.ts)<+new Date(b.ended_at)));return binding?[{...e,user_hash:String(binding.user_id),binding_start:binding.started_at as Date|string}]:[];});
 return {...result,events};
}

/** Cursor batches keep a caller's RR transaction and epoch intact. Worker publication still performs its CAS fence. */
export async function* streamSiteEventBatches(pool:Pool,siteId:string,options:EventReadOptions={},batchSize=1000):AsyncGenerator<EventReadResult>{
 if(!Number.isInteger(batchSize)||batchSize<1||batchSize>1000)throw Error('EVENT_BATCH_LIMIT');
 const owned=!options.client;const client=options.client||await pool.connect();const cursor=`events_${randomUUID().replaceAll('-','')}`;let opened=false;let completed=false;
 try{if(owned)await beginPartitionSnapshot(client);const state=(await client.query('SELECT generation::text,epoch::text,watermark FROM aggregation_state WHERE site_id=$1',[siteId])).rows[0];const {sql,params}=pgEventQuery(siteId,options);await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR ${sql}`,params);opened=true;
  while(true){const events=(await client.query(`FETCH FORWARD ${batchSize} FROM ${cursor}`)).rows as StoredEvent[];if(!events.length)break;yield {events,source:'postgres',mode:'postgres',generation:state?.generation,epoch:state?.epoch,watermark:state?.watermark,coverage:1,fallbackReason:'transaction_snapshot_requires_postgres'};}
  await client.query(`CLOSE ${cursor}`);opened=false;if(owned)await client.query('COMMIT');completed=true;
 }finally{if(opened)await client.query(`CLOSE ${cursor}`).catch(()=>{});if(owned&&!completed)await client.query('ROLLBACK').catch(()=>{});if(owned)client.release();}
}
