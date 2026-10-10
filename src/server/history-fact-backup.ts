import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {publishedFactPredicate} from './fact-member-query.js';
import type {HistoryBackup,HistoryManifest} from './history-store.js';
type Row=Record<string,unknown>;
export interface HistoryFactBacking {version:1;siteId:string;configuration:Row;runs:Row[];effects:Row[];vitals:Row[];hours:Row[];checksum:string}
export type BackedHistoryBackup=HistoryBackup&{factBacking?:HistoryFactBacking};
function canonical(value:unknown):string{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';return JSON.stringify(value);}
function digest(value:unknown){return createHash('sha256').update(canonical(value)).digest('hex');}
async function configuration(client:PoolClient,site:string){const row=(await client.query("SELECT jsonb_build_object('timezone',timezone,'privacy_mode',privacy_mode,'config',config) AS data FROM sites WHERE id=$1",[site])).rows[0];if(!row)throw Error('HISTORY_FACT_SITE_MISSING');return row.data as Row;}
/** Cursors cap each package at 100k rows and the complete backing at 128 MiB. */
async function bounded(client:PoolClient,sql:string,values:unknown[]){const name='history_facts_'+randomUUID().replaceAll('-','');await client.query(`DECLARE ${name} NO SCROLL CURSOR FOR ${sql}`,values);const rows:Row[]=[];let bytes=0;try{for(;;){const batch=(await client.query(`FETCH 100 FROM ${name}`)).rows;if(!batch.length)break;for(const item of batch){bytes+=Buffer.byteLength(JSON.stringify(item.data));if(rows.length>=100000||bytes>128*1024*1024)throw Error('HISTORY_FACT_BACKUP_LIMIT');rows.push(item.data as Row);}}}finally{await client.query(`CLOSE ${name}`);}return rows;}
export async function captureHistoryFactBacking(client:PoolClient,manifest:HistoryManifest):Promise<HistoryFactBacking>{
 for(const table of ['analytics_carry_checkpoints','analytics_carry_keys','analytics_carry_heads','analytics_session_contribution_heads'])if((await client.query('SELECT to_regclass($1) present',[table])).rows[0].present&&(await client.query(`SELECT 1 FROM ${table} LIMIT 1`)).rowCount)throw Error('HISTORY_BACKUP_NONEMPTY_CARRY_UNSUPPORTED');
 const site=manifest.siteId;const runs=await bounded(client,"SELECT to_jsonb(r) AS data FROM analytics_fact_runs r WHERE site_id=$1 AND query_version=2 AND status='published' AND (id=(SELECT id FROM analytics_fact_runs WHERE site_id=$1 AND query_version=2 AND status='published' ORDER BY generation DESC,created_at DESC LIMIT 1) OR EXISTS(SELECT 1 FROM analytics_relational_buckets p WHERE p.run_id=r.id AND p.site_id=$1)) ORDER BY id",[site]);
 if(runs.length&&runs.some(run=>String(run.epoch)!==manifest.epoch))throw Error('HISTORY_FACT_EPOCH_CHANGED');
 const effects=await bounded(client,`SELECT to_jsonb(e) AS data FROM analytics_effect_facts e WHERE ${publishedFactPredicate} ORDER BY run_id,event_id,session_id,metric,key,member`,[site]);
 const vitals=await bounded(client,`SELECT to_jsonb(e) AS data FROM analytics_vital_samples e WHERE ${publishedFactPredicate} ORDER BY run_id,event_id,metric`,[site]);
 const hours=await bounded(client,'SELECT to_jsonb(p) AS data FROM analytics_relational_buckets p WHERE site_id=$1 ORDER BY hour',[site]);
 const body={version:1 as const,siteId:site,configuration:await configuration(client,site),runs,effects,vitals,hours};if(Buffer.byteLength(JSON.stringify(body))>128*1024*1024)throw Error('HISTORY_FACT_BACKUP_LIMIT');return {...body,checksum:digest(body)};
}
/** Import into an empty backing only, or prove exact existing backing before reuse. */
export async function restoreHistoryFactBacking(client:PoolClient,backup:BackedHistoryBackup){
 const backing=backup.factBacking;if(!backing){if(backup.rows.some(row=>Number(row.body.relationalVersion)===2))throw Error('HISTORY_RELATIONAL_BACKING_REQUIRED');return {imported:false,legacy:true};}
 for(const rows of [backing.runs,backing.effects,backing.vitals,backing.hours])if(!Array.isArray(rows)||rows.length>100000)throw Error('HISTORY_FACT_BACKUP_LIMIT');if(Buffer.byteLength(JSON.stringify(backing))>128*1024*1024)throw Error('HISTORY_FACT_BACKUP_LIMIT');
 const {checksum,...body}=backing;if(backing.version!==1||backing.siteId!==backup.manifest.siteId||digest(body)!==checksum)throw Error('HISTORY_FACT_CHECKSUM_INVALID');
 if(digest(await configuration(client,backing.siteId))!==digest(backing.configuration))throw Error('HISTORY_FACT_CONFIGURATION_MISMATCH');
 const current=await captureHistoryFactBacking(client,backup.manifest);if(current.runs.length){if(current.checksum!==checksum)throw Error('HISTORY_FACT_EXISTING_MISMATCH');return {imported:false,reused:true};}
 const state=(await client.query('SELECT epoch::text,processed_generation::text FROM aggregation_state WHERE site_id=$1 FOR UPDATE',[backing.siteId])).rows[0];if(!state)throw Error('HISTORY_FACT_EPOCH_MISSING');const ids=new Map<string,string>();for(const run of backing.runs){if(run.site_id!==backing.siteId||run.status!=='published'||Number(run.query_version)!==2||typeof run.id!=='string'||ids.has(run.id))throw Error('HISTORY_FACT_RUN_INVALID');ids.set(run.id,randomUUID());}
 const ordered=[...backing.runs].sort((a,b)=>BigInt(String(a.generation))>BigInt(String(b.generation))?-1:BigInt(String(a.generation))<BigInt(String(b.generation))?1:String(b.created_at).localeCompare(String(a.created_at)));const generations=new Map(ordered.map((run,index)=>[String(run.id),(BigInt(state.processed_generation)-BigInt(index)).toString()]));
 for(const run of backing.runs){const mapped={...run,id:ids.get(String(run.id)),epoch:state.epoch,generation:generations.get(String(run.id))};await client.query('INSERT INTO analytics_fact_runs SELECT * FROM jsonb_populate_record(NULL::analytics_fact_runs,$1::jsonb)',[mapped]);}
 for(const [table,rows]of [['analytics_effect_facts',backing.effects],['analytics_vital_samples',backing.vitals],['analytics_relational_buckets',backing.hours]] as const){for(const row of rows){const run=ids.get(String(row.run_id));if(!run)throw Error('HISTORY_FACT_REFERENCE_INVALID');if(table==='analytics_relational_buckets'&&row.site_id!==backing.siteId)throw Error('HISTORY_FACT_SITE_MISMATCH');const mapped={...row,run_id:run,...(table==='analytics_relational_buckets'?{epoch:state.epoch,generation:generations.get(String(row.run_id))}:{})};await client.query(`INSERT INTO ${table} SELECT * FROM jsonb_populate_record(NULL::${table},$1::jsonb)`,[mapped]);}}
 return {imported:true,runs:ids.size,effects:backing.effects.length,vitals:backing.vitals.length};
}
