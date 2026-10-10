import {createHash,randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {getRemainingFactStore} from './remaining-fact-store.js';
import {normalizeRemainingRecord,type RemainingFactKind,type RemainingFactRecord} from './remaining-fact-record.js';
import {assertFactReadSourceFence,withFactReadSource,type FactSourceOptions} from './fact-store-source.js';
import {selectedFactRunPredicate,assertFactRunClosure} from './fact-run-closure.js';
import {bindFactReadRelations,factReadRelations} from './fact-read-context.js';
import {canonical} from './security.js';
import {exportControlledCarryProofs} from './carry-provenance.js';
import {getSessionHeaderStore} from './session-header-store.js';
import {verifySessionEventHeaderRecords,type SessionEventHeaderRecord} from './session-event-headers.js';
import type {CarryCheckpoint} from './session-carry.js';

const tables={sessions:'analytics_session_facts',carry_checkpoints:'analytics_carry_checkpoints',numerics:'analytics_numeric_facts',members:'analytics_member_facts',carry_keys:'analytics_carry_keys'} as const;
export interface RemainingReadSource {source:'postgres'|'clickhouse'|'hybrid';sessionsRelation:string;carryCheckpointsRelation:string;numericsRelation:string;membersRelation:string;carryKeysRelation:string;cleanup:()=>Promise<void>}
const iso=(value:string|Date)=>new Date(value).toISOString();

/** Pageless reducer facts still belong to a real sealed event component. */
async function sealedHeaderOwner(client:PoolClient,pool:Pool,site:string,run:string,session:string){
 const meta=(await client.query("SELECT EXISTS(SELECT 1 FROM analytics_header_runs WHERE site_id=$1 AND run_id=$2) OR EXISTS(SELECT 1 FROM analytics_header_batches WHERE site_id=$1 AND run_id=$2) AS migrated",[site,run])).rows[0].migrated;
 let visitor:string|undefined,start=Infinity,end=-Infinity;
 async function accept(rows:SessionEventHeaderRecord[]){
  await verifySessionEventHeaderRecords(client,site,rows);
  for(const row of rows){if(row.run_id!==run||row.session_id!==session)throw Error('REMAINING_HEADER_OWNER_SCOPE');if(visitor!==undefined&&visitor!==row.visitor_id)throw Error('REMAINING_HEADER_OWNER_AMBIGUOUS');visitor=row.visitor_id;const ts=+new Date(row.event_ts);if(!Number.isFinite(ts))throw Error('REMAINING_HEADER_OWNER_TIME');start=Math.min(start,ts);end=Math.max(end,ts);}
 }
 if(meta){const store=getSessionHeaderStore(pool);if(!store)throw Error('SESSION_HEADER_STORE_REQUIRED');for await(const rows of store.streamRows(client,site,run,{sessionId:session}))await accept(rows);}
 else{
  const cursor=`remaining_header_owner_${randomUUID().replaceAll('-','')}`;
  await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT * FROM analytics_session_event_headers WHERE run_id=$1 AND session_id=$2 ORDER BY event_ts,event_id`,[run,session]);
  try{while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows as SessionEventHeaderRecord[];if(!rows.length)break;await accept(rows);}}finally{await client.query(`CLOSE ${cursor}`);}
 }
 if(visitor===undefined)throw Error('REMAINING_FACT_OWNER_MISSING');return {visitor_id:visitor,started_at:new Date(start),ended_at:new Date(end)};
}

/** Same fenced transaction, bounded sealed batches, no durable PG body copy. */
export async function prepareRemainingFactReadSource(client:PoolClient,pool:Pool,siteId:string,options:FactSourceOptions={}):Promise<RemainingReadSource>{
 const repair=await assertFactReadSourceFence(client,siteId,options),schema=(await client.query('SELECT quote_ident(current_schema()) name')).rows[0].name as string;
 const base=Object.fromEntries(Object.entries(tables).map(([kind,table])=>[kind,`${schema}.${table}`])) as Record<RemainingFactKind,string>;
 const strict=(await client.query("SELECT COALESCE(to_jsonb(c)->>'body_mode','transition')='strict' AS strict FROM canonical_event_authority c WHERE site_id=$1",[siteId])).rows[0]?.strict===true;
 const any=(await client.query("SELECT EXISTS(SELECT 1 FROM analytics_remaining_fact_runs m JOIN analytics_fact_runs r ON r.id=m.run_id JOIN aggregation_state a ON a.site_id=r.site_id WHERE m.site_id=$1 AND r.status='published' AND r.epoch=a.epoch) present",[siteId])).rows[0].present;
 if(!any&&strict&&(await client.query("SELECT 1 FROM analytics_fact_runs WHERE site_id=$1 AND status='published' LIMIT 1",[siteId])).rowCount)throw Error('REMAINING_FACT_SOURCE_NOT_MIGRATED');
 if(!any)return {source:'postgres',sessionsRelation:base.sessions,carryCheckpointsRelation:base.carry_checkpoints,numericsRelation:base.numerics,membersRelation:base.members,carryKeysRelation:base.carry_keys,cleanup:async()=>{}};
 const store=getRemainingFactStore(pool);if(!store)throw Error('REMAINING_FACT_STORE_REQUIRED');
 await assertFactRunClosure(client,siteId,{forRebuild:repair});
 const selected=repair?selectedFactRunPredicate.replaceAll('a.processed_generation','a.generation'):selectedFactRunPredicate;
 const temp=Object.fromEntries(Object.keys(tables).map(kind=>[kind,`remaining_${kind}_${randomUUID().replaceAll('-','')}`])) as Record<RemainingFactKind,string>;
 const owners=`remaining_owners_${randomUUID().replaceAll('-','')}`,cpOwners=`remaining_cp_${randomUUID().replaceAll('-','')}`;
 for(const kind of Object.keys(tables) as RemainingFactKind[])await client.query(`CREATE TEMP TABLE ${temp[kind]}(LIKE ${base[kind]} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES) ON COMMIT DROP`);
 await client.query(`CREATE TEMP TABLE ${owners}(run_id uuid,session_id uuid,visitor_id text,started_at timestamptz,ended_at timestamptz,priority integer,PRIMARY KEY(run_id,session_id,priority)) ON COMMIT DROP`);
 await client.query(`CREATE TEMP TABLE ${cpOwners}(run_id uuid,visitor_id text,session_id uuid,PRIMARY KEY(run_id,visitor_id)) ON COMMIT DROP`);
 const cleanup=async()=>{await client.query(`DROP TABLE IF EXISTS ${Object.values(temp).join(',')},${owners},${cpOwners}`);};
 let pg=false,ch=false,opened=false;const cursor=`remaining_runs_${randomUUID().replaceAll('-','')}`;
 async function validateAndInsert(kind:RemainingFactKind,run:string,input:RemainingFactRecord[]){
  if(input.length>100)throw Error('REMAINING_FACT_BATCH_LIMIT');
  const records=input.map(item=>normalizeRemainingRecord(kind,item));
  for(const record of records){if(record.row.run_id!==run)throw Error('REMAINING_FACT_SCOPE');
   if(kind==='carry_checkpoints'){
    const r=record.row as Extract<RemainingFactRecord['row'],{checksum:string}>;
    const cp:CarryCheckpoint={visitorId:r.visitor_id,sessionId:r.session_id,anchorEventId:r.anchor_event_id,through:iso(r.through_ts),lastEventId:r.last_event_id,privacyMode:r.privacy_mode,localDay:r.local_day,definitionsHash:r.definitions_hash,state:r.state as CarryCheckpoint['state'],status:r.status};
    if(createHash('sha256').update(canonical({siteId,...cp})).digest('hex')!==r.checksum)throw Error('CARRY_CHECKSUM_INVALID');
    if(cp.privacyMode==='daily_salt')await exportControlledCarryProofs(client,siteId,[{runId:run,checkpoint:cp}]);
    await client.query(`INSERT INTO ${cpOwners} VALUES($1,$2,$3)`,[run,record.visitorId,record.sessionId]);
    await client.query(`INSERT INTO ${owners} VALUES($1,$2,$3,$4,$5,1)`,[run,record.sessionId,record.visitorId,cp.state.startedAt,cp.state.lastActive]);
   }
   if(kind==='sessions')await client.query(`INSERT INTO ${owners} VALUES($1,$2,$3,$4,$5,0)`,[run,record.sessionId,record.visitorId,record.from,record.to]);
   if(kind==='carry_keys'&&!(await client.query(`SELECT 1 FROM ${cpOwners} WHERE run_id=$1 AND visitor_id=$2 AND session_id=$3`,[run,record.visitorId,record.sessionId])).rowCount)throw Error('REMAINING_CARRY_OWNER_MISSING');
  }
  if(records.length)await client.query(`INSERT INTO ${temp[kind]} SELECT r.* FROM jsonb_to_recordset($2) envelope(row jsonb,"visitorId" text,"from" timestamptz,"to" timestamptz) CROSS JOIN LATERAL jsonb_populate_record(NULL::${base[kind]},envelope.row) r WHERE NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=$1 AND t.visitor_id=envelope."visitorId") AND NOT EXISTS(SELECT 1 FROM identity_tombstones t WHERE t.site_id=$1 AND t.visitor_id=envelope."visitorId" AND t.started_at<=envelope."to" AND t.ended_at>envelope."from")`,[siteId,JSON.stringify(records)]);
 }
 try{
  await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT r.id FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id WHERE r.site_id=$1 AND ${selected} ORDER BY r.id`,[siteId]);opened=true;
  while(true){const runs=(await client.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows;if(!runs.length)break;
   for(const run of runs)for(const kind of Object.keys(tables) as RemainingFactKind[]){
    const marker=(await client.query('SELECT state FROM analytics_remaining_fact_runs WHERE site_id=$1 AND run_id=$2 AND kind=$3',[siteId,run.id,kind])).rows[0];
    if(marker){if(marker.state!=='complete')throw Error('REMAINING_FACT_KIND_INCOMPLETE');ch=true;
     for await(const batch of store.streamRunRows(client,siteId,run.id,kind))await validateAndInsert(kind,run.id,batch.map(row=>({row:row.row,visitorId:row.visitorId,sessionId:row.sessionId,from:row.from,to:row.to})));
    }else{if(strict)throw Error('REMAINING_FACT_SOURCE_NOT_MIGRATED');pg=true;const old=`remaining_old_${randomUUID().replaceAll('-','')}`;await client.query(`DECLARE ${old} NO SCROLL CURSOR FOR SELECT * FROM ${base[kind]} WHERE run_id=$1`,[run.id]);
     try{while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${old}`)).rows;if(!rows.length)break;const batch:RemainingFactRecord[]=[];
      for(const row of rows){let visitorId:string,from:string,to:string;
       if(kind==='sessions'){visitorId=row.visitor_id;from=iso(row.data.started_at);to=iso(row.data.last_active);}
       else if(kind==='carry_checkpoints'){visitorId=row.visitor_id;from=iso(row.state.startedAt);to=iso(row.through_ts);row.local_day=typeof row.local_day==='string'?row.local_day:iso(row.local_day).slice(0,10);}
       else if(kind==='carry_keys'){visitorId=row.visitor_id;from=iso(row.first_ts);to=iso(row.last_ts);}
       else{let owner=(await client.query(`SELECT * FROM ${owners} WHERE run_id=$1 AND session_id=$2 ORDER BY priority LIMIT 1`,[run.id,row.session_id])).rows[0];if(!owner){owner=await sealedHeaderOwner(client,pool,siteId,run.id,row.session_id);await client.query(`INSERT INTO ${owners} VALUES($1,$2,$3,$4,$5,2)`,[run.id,row.session_id,owner.visitor_id,owner.started_at,owner.ended_at]);}visitorId=owner.visitor_id;from=iso(owner.started_at);to=iso(owner.ended_at);}
       batch.push({row,visitorId,sessionId:row.session_id,from,to});
      }await validateAndInsert(kind,run.id,batch);
     }}finally{await client.query(`CLOSE ${old}`);}
    }
   }
  }
  await client.query(`CLOSE ${cursor}`);opened=false;
  const missing=(await client.query(`SELECT 1 FROM analytics_carry_heads h JOIN analytics_fact_runs r ON r.id=h.run_id JOIN aggregation_state a ON a.site_id=h.site_id WHERE h.site_id=$1 AND h.epoch=a.epoch AND h.generation<=${repair?'a.generation':'a.processed_generation'} AND r.status='published' AND NOT EXISTS(SELECT 1 FROM ${cpOwners} c WHERE c.run_id=h.run_id AND c.visitor_id=h.visitor_id) LIMIT 1`,[siteId])).rowCount;
  if(missing)throw Error('REMAINING_CARRY_HEAD_BACKING_MISSING');
  return {source:ch?(pg?'hybrid':'clickhouse'):'postgres',sessionsRelation:`pg_temp.${temp.sessions}`,carryCheckpointsRelation:`pg_temp.${temp.carry_checkpoints}`,numericsRelation:`pg_temp.${temp.numerics}`,membersRelation:`pg_temp.${temp.members}`,carryKeysRelation:`pg_temp.${temp.carry_keys}`,cleanup};
 }catch(error){if(opened)await client.query(`CLOSE ${cursor}`).catch(()=>undefined);await cleanup().catch(()=>undefined);throw error;}
}

/** Effects/vitals are hydrated first; an unrelated bound context must never
 * cause their CH body source to be mistaken for empty permanent PG tables. */
export async function withRemainingFactReadSource<T>(client:PoolClient,pool:Pool,siteId:string,read:(source:RemainingReadSource)=>Promise<T>,options:FactSourceOptions={}):Promise<T>{
 return withFactReadSource(client,pool,siteId,async facts=>{
  const prior=factReadRelations(client);
  if(prior.sessionsRelation&&prior.numericsRelation&&prior.membersRelation&&prior.carryCheckpointsRelation&&prior.carryKeysRelation)return read({...prior,source:prior.source??'postgres',sessionsRelation:prior.sessionsRelation,numericsRelation:prior.numericsRelation,membersRelation:prior.membersRelation,carryCheckpointsRelation:prior.carryCheckpointsRelation,carryKeysRelation:prior.carryKeysRelation,cleanup:async()=>{}});
  const source=await prepareRemainingFactReadSource(client,pool,siteId,options),sourceLabel=facts.source===source.source?source.source:'hybrid';
  const restore=bindFactReadRelations(client,{...prior,...source,source:sourceLabel});
  try{return await read({...source,source:sourceLabel});}finally{restore();await source.cleanup();}
 },options);
}
