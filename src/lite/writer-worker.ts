import {parentPort,workerData} from 'node:worker_threads';
import {backup} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {openDatabase,transaction} from './database.js';
import {handleTask} from './task-domain.js';
import type {LiteWriteContext} from './types.js';
const db=openDatabase(workerData.path);
const {handleOps}=await import('./ops-domain.js');
handleOps({db,dataDir:workerData.dataDir,keyDir:workerData.keyDir,now:Date.now()},'startup_replay',{});
parentPort!.postMessage({ready:true,runtime:db.prepare('SELECT sqlite_version() sqliteVersion,sqlite_source_id() sourceId').get()});
let needsReplay=false;
async function dispatch(kind:string,p:Record<string,unknown>):Promise<unknown>{
 const c:LiteWriteContext={db,dataDir:workerData.dataDir,keyDir:workerData.keyDir,now:Date.now()};
 if(needsReplay&&kind!=='__close'){handleOps(c,'startup_replay',{});needsReplay=false;}
 if(kind==='__barrier')return true;
 if(kind==='__backup'){await backup(db,String(p.destination));return true;}
 if(kind==='__close'){db.close();return true;}
 if(kind==='wal_status'){const result=db.prepare('PRAGMA wal_checkpoint(PASSIVE)').get()!;const pageSize=Number(db.prepare('PRAGMA page_size').get()!.page_size);return {...result,pageSize,dirtyBytes:Math.max(0,Number(result.log)-Number(result.checkpointed))*pageSize};}
 if(kind==='checkpoint'){if(p.truncate){db.exec('PRAGMA busy_timeout=0');try{return db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();}finally{db.exec('PRAGMA busy_timeout=1000');}}return db.prepare('PRAGMA wal_checkpoint(PASSIVE)').get();}
 if(kind.startsWith('insights_')){const m=await import('./insights-domain.js');return m.handleInsights(c,kind,p);}
 if(kind.startsWith('task_'))return handleTask(c,kind,p);
 if(kind==='intake'){const wal=db.prepare('PRAGMA wal_checkpoint(PASSIVE)').get()!;const pageSize=Number(db.prepare('PRAGMA page_size').get()!.page_size);const dirtyBytes=Math.max(0,Number(wal.log)-Number(wal.checkpointed))*pageSize;if(dirtyBytes+Buffer.byteLength(JSON.stringify(p))>(workerData.maxWalBytes??128*1024*1024))throw new Error('LITE_WAL_BACKPRESSURE');const m=await import('./intake-domain.js');return m.handleIntake(c,kind,p as never);}
 if(['identity_delete','retention','startup_replay','ops_restore'].includes(kind)){const m=await import('./ops-domain.js');try{return m.handleOps(c,kind,p);}catch(error){needsReplay=true;throw error;}}
 return transaction(db,()=>{
 const authorize=(siteId:string)=>{if(p.actorId){const actor=db.prepare('SELECT is_admin FROM users WHERE id=?').get(String(p.actorId));const member=db.prepare('SELECT role FROM site_members WHERE site_id=? AND user_id=?').get(siteId,String(p.actorId));if(!actor||!actor.is_admin&&(!member||member.role==='viewer'||(['site_update','export_create'].includes(kind)&&!['owner','admin'].includes(String(member.role)))))throw new Error('LITE_SITE_FORBIDDEN');}};
 const bump=(siteId:string)=>{db.prepare('UPDATE sites SET generation=generation+1 WHERE id=?').run(siteId);const row=db.prepare('SELECT epoch,generation FROM sites WHERE id=?').get(siteId)!;db.prepare("INSERT INTO jobs(id,site_id,kind,dedupe_key,status,payload,next_at,epoch,generation) VALUES(?,?,'aggregate',?,'pending','{}',?,?,?)").run(randomUUID(),siteId,String(row.generation),c.now,row.epoch,row.generation);};
 if(kind==='accounts_setup'){if(db.prepare('SELECT id FROM users LIMIT 1').get())throw new Error('LITE_SETUP_COMPLETE');const id=randomUUID();db.prepare('INSERT INTO users VALUES(?,?,?,?,1,?)').run(id,String(p.email).toLowerCase(),String(p.name),String(p.passwordHash),c.now);return {id,email:String(p.email).toLowerCase(),name:p.name,is_admin:true};}
 if(kind==='session_create'){db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(String(p.tokenHash),String(p.userId),Number(p.expiresAt));return true;}
 if(kind==='session_delete'){db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(String(p.tokenHash));return true;}
 if(kind==='sites_create'){const id=String(p.id??randomUUID());const epoch=randomUUID();db.prepare('INSERT INTO sites(id,name,domain,timezone,privacy_mode,retention_days,salt_secret,config,owner_id,epoch) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,String(p.name),String(p.domain),String(p.timezone??'UTC'),String(p.privacy_mode??'standard'),Number(p.retention_days??365),String(p.salt_secret??randomUUID()),JSON.stringify(p.config??{}),String(p.owner_id??p.ownerId),epoch);db.prepare("INSERT INTO site_members VALUES(?,?,'owner')").run(id,String(p.owner_id??p.ownerId));return {id,epoch};}
 if(kind==='site_update'){authorize(String(p.siteId));const current=db.prepare('SELECT privacy_mode,config FROM sites WHERE id=?').get(String(p.siteId));if(!current)throw new Error('LITE_SITE_NOT_FOUND');if(p.privacy_mode!==undefined&&p.privacy_mode!==current.privacy_mode&&db.prepare('SELECT 1 FROM events WHERE site_id=? LIMIT 1').get(String(p.siteId)))throw new Error('LITE_PRIVACY_MODE_CHANGE_REQUIRES_NEW_SITE');if(p.config!==undefined)p.config={...JSON.parse(String(current.config)),...p.config as Record<string,unknown>};const keys=['name','domain','timezone','privacy_mode','retention_days','config'];for(const key of keys)if(p[key]!==undefined)db.prepare(`UPDATE sites SET ${key}=? WHERE id=?`).run(key==='config'?JSON.stringify(p[key]):p[key] as string|number,String(p.siteId));bump(String(p.siteId));return true;}
 if(kind==='goals_create'){authorize(String(p.siteId));const id=randomUUID();db.prepare('INSERT INTO goals VALUES(?,?,?,?)').run(id,String(p.siteId),String(p.name),JSON.stringify(p.definition));bump(String(p.siteId));return {id};}
 if(kind==='goals_delete'){authorize(String(p.siteId));db.prepare('DELETE FROM goals WHERE id=? AND site_id=?').run(String(p.id),String(p.siteId));bump(String(p.siteId));return true;}
 if(kind==='export_create'){authorize(String(p.siteId));const site=db.prepare('SELECT epoch,generation FROM sites WHERE id=?').get(String(p.siteId))!;const id=randomUUID();db.prepare("INSERT INTO exports(id,site_id,format,status,generation,epoch,created_at) VALUES(?,?,?,'pending',?,?,?)").run(id,String(p.siteId),String(p.format??'json'),site.generation,site.epoch,c.now);db.prepare("INSERT INTO jobs(id,site_id,kind,dedupe_key,status,payload,next_at,epoch,generation) VALUES(?,?,'export',?,'pending',?,?,?,?)").run(randomUUID(),String(p.siteId),id,JSON.stringify({exportId:id}),c.now,site.epoch,site.generation);return {id,status:'pending'};}
 throw new Error('LITE_UNKNOWN_COMMAND:'+kind);
 });
}
let completed=0;let chain=Promise.resolve();parentPort!.on('message',({id,kind,payload})=>{chain=chain.then(async()=>{try{const result=await dispatch(kind,payload);if(kind!=='__close'&&++completed%50===0){try{db.exec('PRAGMA busy_timeout=0');db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();}catch{/* A busy reader cannot block durable ACK. */}finally{db.exec('PRAGMA busy_timeout=1000');}}parentPort!.postMessage({id,result});}catch(error){const e=error as Error&{code?:string;statusCode?:number;errcode?:number};parentPort!.postMessage({id,error:[5,6].includes(e.errcode??0)?'SQLITE_BUSY':e.errcode===13?'SQLITE_FULL':e.message,code:e.code,statusCode:[5,6,13].includes(e.errcode??0)?503:Number.isInteger(e.statusCode)&&e.statusCode!>=400&&e.statusCode!<=599?e.statusCode:undefined});}});});
