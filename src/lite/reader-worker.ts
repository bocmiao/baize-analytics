import {parentPort,workerData} from 'node:worker_threads';
import {computeLiteStats} from './analytics.js';
import type {LiteSnapshot} from './types.js';
import {openDatabase} from './database.js';
const db=openDatabase(workerData.path,true);
const site=(r:Record<string,unknown>|undefined):Record<string,unknown>|null=>r?{...r,config:JSON.parse(String(r.config))}:null;
interface ReadBudget {bytes:number;count:number}
function boundedRows(statement:ReturnType<typeof db.prepare>,parameters:(string|number)[],budget:ReadBudget={bytes:0,count:0},project:(row:Record<string,unknown>)=>Record<string,unknown>=row=>row){const rows:Record<string,unknown>[]=[];for(const raw of statement.iterate(...parameters)){if(raw.__budget_oversize===1||Buffer.byteLength(JSON.stringify(raw))+1>32*1024*1024-budget.bytes)throw Object.assign(new Error('analytics_query_limit'),{statusCode:413});const row=project(raw);budget.bytes+=Buffer.byteLength(JSON.stringify(row))+1;budget.count++;if(budget.count>100000||budget.bytes>32*1024*1024)throw Object.assign(new Error('analytics_query_limit'),{statusCode:413});rows.push(row);}return rows;}
const goal=(r:Record<string,unknown>)=>{const {__budget_oversize:_guard,...row}=r;return {...row,...JSON.parse(String(row.definition)),definition:JSON.parse(String(row.definition))};};
const goalQuery='SELECT id,site_id,name,CASE WHEN length(cast(definition AS BLOB))>33554432 THEN NULL ELSE definition END definition,CASE WHEN length(cast(definition AS BLOB))>33554432 THEN 1 ELSE 0 END __budget_oversize FROM goals WHERE site_id=? ORDER BY id';
function read(kind:string,p:Record<string,unknown>):unknown{
 if(kind==='__test_native_long_read'&&workerData.allowTestDiagnostics===true){parentPort!.postMessage({diagnostic:'native_started'});return db.prepare('WITH RECURSIVE counter(n) AS (VALUES(0) UNION ALL SELECT n+1 FROM counter WHERE n<2000000) SELECT sum(n) total FROM counter').get();}
 if(kind==='stats'){const snapshot=read('stats_snapshot',p) as LiteSnapshot;return {...computeLiteStats(snapshot,String(p.from),String(p.to),(p.filters??{}) as never,Number(p.now??Date.now())),goalDefinitions:snapshot.goals.map(g=>({id:g.id,name:g.name})),intakeObservation:{count:snapshot.events.length,firstEventTime:snapshot.events.at(0)?.ts??null,lastEventTime:snapshot.events.at(-1)?.ts??null},processedGeneration:(snapshot.site as unknown as Record<string,unknown>).processed_generation};}
 if(kind==='sites_admin')return db.prepare('SELECT * FROM sites ORDER BY name,id').all().map(site);
 if(kind==='site_usage')return db.prepare('SELECT count(*) events,coalesce(sum(length(cast(payload AS BLOB))+length(cast(dimensions AS BLOB))),0) body_bytes,min(ts) first_ts,max(ts) last_ts FROM events WHERE site_id=?').get(String(p.siteId));
 if(kind==='task_depth')return db.prepare('SELECT status,count(*) count FROM jobs GROUP BY status').all();
 if(kind==='metadata')return {setup_required:!db.prepare('SELECT id FROM users LIMIT 1').get()};
 if(kind==='accounts_login')return db.prepare('SELECT * FROM users WHERE email=?').get(String(p.email).toLowerCase())??null;
 if(kind==='user_get')return db.prepare('SELECT id,email,name,is_admin FROM users WHERE id=?').get(String(p.userId))??null;
 if(kind==='session_get')return db.prepare('SELECT u.id,u.email,u.name,u.is_admin FROM auth_sessions a JOIN users u ON u.id=a.user_id WHERE a.token_hash=? AND a.expires_at>?').get(String(p.tokenHash),Date.now())??null;
 if(kind==='sites_list')return db.prepare('SELECT s.* FROM sites s JOIN site_members m ON m.site_id=s.id WHERE m.user_id=? ORDER BY s.name,s.id').all(String(p.userId)).map(site);
 if(kind==='site_get')return site(db.prepare('SELECT * FROM sites WHERE id=?').get(String(p.siteId)));
 if(kind==='site_member')return db.prepare('SELECT role FROM site_members WHERE site_id=? AND user_id=?').get(String(p.siteId),String(p.userId))??null;
 if(kind==='goals_list')return boundedRows(db.prepare(goalQuery),[String(p.siteId)],undefined,goal);
 if(kind==='exports_list')return db.prepare('SELECT * FROM exports WHERE site_id=? ORDER BY created_at DESC LIMIT 100').all(String(p.siteId));
 if(kind==='export_get')return db.prepare(`SELECT e.*,(SELECT json_extract(j.result,'$.fileHash') FROM jobs j WHERE j.site_id=e.site_id AND j.kind='export' AND j.status='complete' AND json_extract(j.payload,'$.exportId')=e.id LIMIT 1) AS fileHash FROM exports e WHERE e.site_id=? AND e.id=?`).get(String(p.siteId),String(p.id))??null;
 if(kind==='stats_snapshot'){
 db.exec('BEGIN');try{const s=site(db.prepare('SELECT * FROM sites WHERE id=?').get(String(p.siteId)));if(!s)throw new Error('LITE_SITE_NOT_FOUND');
 const budget={bytes:Buffer.byteLength(JSON.stringify(s))+512,count:0};
 const events=boundedRows(db.prepare('SELECT site_id,event_id,ts,visitor_id,page_id,type,path,CASE WHEN length(cast(payload AS BLOB))+length(cast(dimensions AS BLOB))>33554432 THEN NULL ELSE payload END payload,CASE WHEN length(cast(payload AS BLOB))+length(cast(dimensions AS BLOB))>33554432 THEN NULL ELSE dimensions END dimensions,CASE WHEN length(cast(payload AS BLOB))+length(cast(dimensions AS BLOB))>33554432 THEN 1 ELSE 0 END __budget_oversize FROM events WHERE site_id=? ORDER BY ts,event_id'),[String(p.siteId)],budget,r=>({payload:JSON.parse(String(r.payload)),dimensions:JSON.parse(String(r.dimensions)),event_id:r.event_id,site_id:r.site_id,ts:new Date(Number(r.ts)).toISOString(),visitor_id:r.visitor_id,page_id:r.page_id,type:r.type,path:r.path}));
 const goals=boundedRows(db.prepare(goalQuery),[String(p.siteId)],budget,goal);
 const archivedBuckets=boundedRows(db.prepare('SELECT hour,CASE WHEN length(cast(data AS BLOB))>33554432 THEN NULL ELSE data END data,CASE WHEN length(cast(data AS BLOB))>33554432 THEN 1 ELSE 0 END __budget_oversize FROM rollups WHERE site_id=? AND epoch=? ORDER BY hour'),[String(p.siteId),String(s.epoch)],budget,r=>({hour:r.hour,data:JSON.parse(String(r.data))}));db.exec('COMMIT');return {site:s,events,goals,generation:s.generation,epoch:s.epoch,archivedBuckets};
 }catch(e){db.exec('ROLLBACK');throw e;}}
 throw new Error('LITE_UNKNOWN_READ:'+kind);
}
parentPort!.on('message',({id,kind,payload})=>{try{parentPort!.postMessage({id,result:read(kind,payload)});}catch(e){parentPort!.postMessage({id,error:(e as Error).message,statusCode:Number.isInteger((e as {statusCode?:number}).statusCode)?(e as {statusCode?:number}).statusCode:undefined});}});
