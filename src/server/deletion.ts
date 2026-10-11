import {discardStrictPublishedCarryStaging} from './strict-carry-staging.js';
import {getCacheStore} from './cache-store.js';
import {captureCanonicalCutoverPrivacyRepair,finalizeCanonicalCutoverPrivacyRepair} from './cutover-receipt.js';
import {getRemainingFactStore} from './remaining-fact-store.js';
import {getFactStore} from './fact-store.js';
import {rebaseHeaderPublishedEpoch} from './session-header-lifecycle.js';
import {getSessionHeaderStore} from './session-header-store.js';
import {eraseSessionEventHeaderSegments} from './session-event-headers.js';
import {eraseSessionCarrySegments,rebaseSessionCarryEpoch} from './session-carry-lifecycle.js';
import {purgeProvenanceSegments} from './provenance-lifecycle.js';
import {captureFactDeletionMetadata,invalidateFactSegments,rebasePublishedFactEpoch} from './fact-invalidation.js';
import {redactCanonicalReplay} from './canonical-replay-cleanup.js';
import {removeReplayKeySegments} from './replay-key-cleanup.js';
import {getCanonicalStore} from './canonical-clickhouse.js';
import type {CanonicalSegment} from './canonical-clickhouse.js';
import {invalidateSiteAi} from './ai-invalidation.js';
import {invalidateSiteFacts} from './session-facts.js';
import {cleanupHistoryBackupFiles} from './history-security.js';
import {deleteHistorySegments,rebaseDeletedHistory} from './history-store.js';
import type { AppContext } from './context.js';
import type { Pool,PoolClient } from 'pg';
import { mkdir,open,readFile,rename } from 'node:fs/promises';
import { createHash,randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { transaction,lockSite,dirtySite } from './db.js';
import { HttpError,visitorHash } from './security.js';
import {scheduleExportCleanup,runFileCleanup} from './file-cleanup.js';
import {userDeletionRecords,purgeIdentity,purgeIncrementalVisitorMetadata,type IdentityDeletionRecord} from './identity.js';
export interface DeletionRecord {site_id:string;visitor_id:string;user_id:string|null;deleted_at:string;source:string;started_at?:string;ended_at?:string|null}
interface JournalWatermark {records:number;sha256:string}
function journalRecords(data:Buffer):DeletionRecord[]{
  const text=data.toString('utf8');if(text&&!text.endsWith('\n'))throw new Error('Deletion journal is truncated; queries remain closed');
  return text.split('\n').filter(Boolean).map(line=>{const record=JSON.parse(line) as DeletionRecord;if(typeof record.site_id!=='string'||!record.site_id||typeof record.visitor_id!=='string'||!record.visitor_id||typeof record.deleted_at!=='string'||!Number.isFinite(Date.parse(record.deleted_at)))throw new Error('Invalid deletion journal; queries remain closed');const temporal=record as DeletionRecord&{started_at?:string;ended_at?:string};if(record.source==='identity-segment'&&(!record.user_id||!temporal.started_at||!Number.isFinite(Date.parse(temporal.started_at))||(temporal.ended_at!=null&&temporal.ended_at!=='infinity'&&(!Number.isFinite(Date.parse(temporal.ended_at))||Date.parse(temporal.ended_at)<=Date.parse(temporal.started_at!)))))throw new Error('Invalid identity deletion interval; recovery blocked');return record;});
}
function journalWatermark(data:Buffer):JournalWatermark{return {records:journalRecords(data).length,sha256:createHash('sha256').update(data).digest('hex')};}
async function persistWatermark(dataDir:string,data:Buffer){
  const temp=join(dataDir,`tombstones.watermark.${randomUUID()}.tmp`),file=await open(temp,'wx',0o600);
  try{await file.writeFile(JSON.stringify(journalWatermark(data)));await file.sync();}finally{await file.close();}
  await rename(temp,join(dataDir,'tombstones.watermark.json'));const directory=await open(dataDir,'r');try{await directory.sync();}finally{await directory.close();}
}
export async function initializeJournal(dataDir:string,requireExisting=false){
  const path=join(dataDir,'tombstones.jsonl'),marker=join(dataDir,'tombstones.watermark.json');let data:Buffer|undefined,watermark:JournalWatermark|undefined;
  try{data=await readFile(path);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  try{watermark=JSON.parse(await readFile(marker,'utf8')) as JournalWatermark;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  if(!data){if(requireExisting||watermark)throw new Error('Independent deletion journal is missing; recovery blocked');await mkdir(dataDir,{recursive:true,mode:0o700});const file=await open(path,'wx',0o600);try{await file.sync();}finally{await file.close();}data=Buffer.alloc(0);}
  const actual=journalWatermark(data);
  if(!watermark){if(requireExisting||actual.records)throw new Error('Independent deletion journal watermark is missing; recovery blocked');await persistWatermark(dataDir,data);return actual;}
  if(!Number.isSafeInteger(watermark.records)||watermark.records<0||!(/^[a-f0-9]{64}$/).test(watermark.sha256))throw new Error('Invalid deletion journal watermark; recovery blocked');
  if(actual.records===watermark.records&&actual.sha256===watermark.sha256)return actual;
  // Crash after log fsync but before marker rename: normal startup may advance
  // only a complete extension whose already acknowledged prefix is intact.
  if(!requireExisting&&actual.records>watermark.records){const lines=data.toString('utf8').split('\n').filter(Boolean);const prefix=Buffer.from(lines.slice(0,watermark.records).join('\n')+(watermark.records?'\n':''));if(createHash('sha256').update(prefix).digest('hex')===watermark.sha256){await persistWatermark(dataDir,data);return actual;}}
  throw new Error('Deletion journal does not match durable watermark; recovery blocked');
}
export async function readVerifiedDeletionRecords(dataDir:string):Promise<DeletionRecord[]>{await initializeJournal(dataDir,true);return journalRecords(await readFile(join(dataDir,'tombstones.jsonl')));}
let journalWrite:Promise<void>=Promise.resolve();
async function appendJournal(dataDir:string,records:DeletionRecord[],client?:PoolClient){
  if(client)await client.query('SELECT pg_advisory_xact_lock(92834104)');
  const previous=journalWrite;let release!:()=>void;journalWrite=new Promise<void>(resolve=>{release=resolve;});await previous;
  try{await initializeJournal(dataDir);const file=await open(join(dataDir,'tombstones.jsonl'),'a',0o600);try{await file.writeFile(records.map(r=>JSON.stringify(r)+'\n').join(''));await file.sync();}finally{await file.close();}await persistWatermark(dataDir,await readFile(join(dataDir,'tombstones.jsonl')));}finally{release();}
}
async function erasePhysicalHeaders(client:PoolClient,pool:Pool,siteId:string,records:DeletionRecord[]){
 const store=getSessionHeaderStore(pool);
 if(!store){if((await client.query('SELECT 1 FROM analytics_header_batches WHERE site_id=$1 LIMIT 1',[siteId])).rowCount)throw new HttpError(503,'session_header_delete_unavailable');return;}
 await store.eraseSegments(client,siteId,records.filter(r=>r.source==='identity-segment'||!r.visitor_id.startsWith('user:')).map(r=>({visitorId:r.visitor_id,from:r.started_at,to:r.ended_at==='infinity'?undefined:r.ended_at??undefined})));
}
async function erasePhysicalFacts(client:PoolClient,pool:Pool,siteId:string,records:DeletionRecord[]){
 const store=getFactStore(pool);
 if(!store){if((await client.query('SELECT 1 FROM analytics_fact_store_batches WHERE site_id=$1 LIMIT 1',[siteId])).rowCount)throw new HttpError(503,'fact_store_delete_unavailable');return;}
 await store.eraseSegments(client,siteId,records.filter(r=>r.source==='identity-segment'||!r.visitor_id.startsWith('user:')).map(r=>({visitorId:r.visitor_id,from:r.started_at,to:r.ended_at==='infinity'?undefined:r.ended_at??undefined})));
}
async function rebasePhysicalFacts(client:PoolClient,pool:Pool,siteId:string){const store=getFactStore(pool);if(store){const epoch=(await client.query('SELECT epoch FROM aggregation_state WHERE site_id=$1',[siteId])).rows[0]?.epoch;if(epoch)await store.rebasePublishedRuns(client,siteId,epoch);}}
async function eraseRemainingPhysical(client:PoolClient,pool:Pool,siteId:string,records:DeletionRecord[],dataDir:string){
 let handled:string[]=[];const store=getRemainingFactStore(pool);if(!(await client.query("SELECT to_regclass('analytics_remaining_fact_batches') IS NOT NULL AS present")).rows[0].present){if(store)throw new HttpError(503,'remaining_fact_schema_unavailable');return handled;}const present=(await client.query('SELECT 1 FROM analytics_remaining_fact_batches WHERE site_id=$1 LIMIT 1',[siteId])).rowCount;
 if(!store&&present)throw new HttpError(503,'remaining_fact_delete_unavailable');
 const segments=records.filter(r=>r.source==='identity-segment'||!r.visitor_id.startsWith('user:')).map(r=>({visitorId:r.visitor_id,from:r.started_at,to:r.ended_at==='infinity'?undefined:r.ended_at??undefined}));
 if(store){try{const {eraseRemainingPrivateSegments}=await import('./remaining-privacy-cleanup.js');handled=await eraseRemainingPrivateSegments(client,pool,store,siteId,dataDir,records,async recovering=>{await erasePhysicalHeaders(client,pool,siteId,recovering);await eraseSessionEventHeaderSegments(client,siteId,recovering.map(r=>({visitorId:r.visitor_id,from:r.started_at,to:r.ended_at})));await canonicalDeletionBarrier(pool,client,siteId,recovering);});}catch(error){if(error instanceof Error&&error.message==='REMAINING_FACT_CH_UNAVAILABLE')throw new HttpError(503,'remaining_fact_delete_unavailable');throw error;}}
 for(const segment of segments)if(!segment.from&&!segment.to){await client.query('DELETE FROM canonical_carry_provenance p USING analytics_fact_runs r WHERE r.id=p.run_id AND r.site_id=$1 AND p.visitor_id=$2',[siteId,segment.visitorId]);await client.query('DELETE FROM analytics_carry_heads WHERE site_id=$1 AND visitor_id=$2',[siteId,segment.visitorId]);}return handled;
}
async function rebaseRemainingPhysical(client:PoolClient,pool:Pool,siteId:string){const store=getRemainingFactStore(pool);if(store){const epoch=(await client.query('SELECT epoch FROM aggregation_state WHERE site_id=$1',[siteId])).rows[0]?.epoch;if(epoch)await store.rebasePublishedRuns(client,siteId,epoch);}}
/** Derived cache bodies may contain deleted identity contributions even after
 * pointers move. Erase every attempt physically before changing receipts; the
 * independent exact fact stores remain authoritative for surviving visitors. */
async function erasePhysicalCaches(client:PoolClient,pool:Pool,siteId:string){
  const store=getCacheStore(pool),schema=(await client.query("SELECT to_regclass('analytics_cache_owners') present")).rows[0].present;
  if(!schema){if(store)throw new HttpError(503,'cache_delete_schema_unavailable');return;}
  if(!store){const required=(await client.query("SELECT EXISTS(SELECT 1 FROM analytics_cache_owners WHERE site_id=$1) OR EXISTS(SELECT 1 FROM canonical_event_authority WHERE site_id=$1 AND body_mode='strict') AS required",[siteId])).rows[0].required;if(required)throw new HttpError(503,'cache_delete_unavailable');return;}
  try{await store.invalidateSite(client,siteId);}catch(error){if(error instanceof Error&&error.message==='CACHE_CH_UNAVAILABLE')throw new HttpError(503,'cache_delete_unavailable');throw error;}
}
async function invalidateDerived(client:PoolClient,siteId:string,dataDir:string){
  await invalidateSiteAi(client,siteId);
  const relational=Boolean((await client.query("SELECT 1 FROM analytics_fact_runs WHERE site_id=$1 AND query_version=2 AND status='published' LIMIT 1",[siteId])).rowCount);
  if(!relational)await invalidateSiteFacts(client,siteId);
  await scheduleExportCleanup(client,siteId,dataDir);
  for(const table of [...(relational?[]:['stats_hourly']),'stats_daily','page_vitals','analytics_definitions','heatmap_points'])await client.query(`DELETE FROM ${table} WHERE site_id=$1`,[siteId]);
  await client.query("UPDATE sites SET config=config||jsonb_build_object('deletion_boundary','已删除派生结果，保留期内将完整重算；超过保留期的历史统计不可恢复') WHERE id=$1",[siteId]);
  await client.query('UPDATE aggregation_state SET epoch=gen_random_uuid(),lease_owner=NULL,lease_until=NULL,processed_generation=0,watermark=NULL,attempts=0,dead_letter_at=NULL,last_error=NULL WHERE site_id=$1',[siteId]);
  await rebasePublishedFactEpoch(client,siteId);
  await rebaseSessionCarryEpoch(client,siteId);
  await rebaseHeaderPublishedEpoch(client,siteId);
  await dirtySite(client,siteId);
  await client.query("UPDATE export_jobs SET status='revoked',path=NULL WHERE site_id=$1",[siteId]);
}
async function purge(client:PoolClient,siteId:string,visitors:string[],dataDir:string){
  await purgeIncrementalVisitorMetadata(client,siteId,visitors);
  await client.query('DELETE FROM events WHERE site_id=$1 AND visitor_id=ANY($2::text[])',[siteId,visitors]);
  for(const table of ['event_keys','outbox','identity_map','identity_bindings','visitor_first_seen','sessions','revenue_orders'])await client.query(`DELETE FROM ${table} WHERE site_id=$1 AND visitor_id=ANY($2::text[])`,[siteId,visitors]);
  await client.query('DELETE FROM experiment_assignments WHERE visitor_id=ANY($2::text[]) AND experiment_id IN(SELECT id FROM experiments WHERE site_id=$1)',[siteId,visitors]);
  await removeReplayKeySegments(client,siteId,visitors.map(visitorId=>({visitorId})));
  for(const visitor of visitors)await client.query('DELETE FROM replay_chunks WHERE site_id=$1 AND starts_with(session_id,$2)',[siteId,visitor+':']);
  await purgeProvenanceSegments(client,siteId,visitors.map(visitorId=>({visitorId})));
  await invalidateDerived(client,siteId,dataDir);
}
export async function invalidateSiteCache(ctx:AppContext,siteId:string){if(!ctx.redis)return;for(const prefix of [`analytics:${siteId}:*`,`baize:online:${siteId}:*`]){let cursor='0';do{const r=await ctx.redis.scan(cursor,'MATCH',prefix,'COUNT',100);cursor=r[0];if(r[1].length)await ctx.redis.del(...r[1]);}while(cursor!=='0');}}
async function canonicalDeletionBarrier(pool:Pool,client:PoolClient,siteId:string,records:DeletionRecord[]):Promise<boolean>{
 const authority=(await client.query('SELECT authority FROM canonical_event_authority WHERE site_id=$1 FOR UPDATE',[siteId])).rows[0];
 if(authority?.authority!=='clickhouse')return false;
 const store=getCanonicalStore(pool);if(!store)throw new HttpError(503,'canonical_delete_store_required');
 const segments:CanonicalSegment[]=records.filter(r=>r.source==='identity-segment'||!r.visitor_id.startsWith('user:')).map(r=>({visitorId:r.visitor_id,from:r.started_at,to:r.ended_at==='infinity'?undefined:r.ended_at??undefined}));
 try{await redactCanonicalReplay(client,store,siteId,segments);await store.deleteSegments(client,siteId,segments,async()=>{});await dirtySite(client,siteId);}catch{throw new HttpError(503,'canonical_delete_unavailable');}return true;
}
export async function deleteVisitor(ctx:AppContext,siteId:string,input:{visitor_id?:string;user_id?:string},actorId:string|null){
  const deleted=await transaction(ctx.pool,async client=>{await lockSite(client,siteId);const site=(await client.query('SELECT salt_secret,privacy_mode FROM sites WHERE id=$1',[siteId])).rows[0];if(!site)throw new HttpError(404,'站点不存在');if(site.privacy_mode==='daily_salt'&&input.user_id)throw new HttpError(400,'每日盐模式不支持跨日身份关联');const userId=input.user_id?visitorHash(site.salt_secret,'identity',input.user_id,''):null;
    if(!input.visitor_id&&!userId)throw new HttpError(400,'需要访客或用户标识');
    const records:DeletionRecord[]=[];const visitors=input.visitor_id?[input.visitor_id]:[];
    if(input.visitor_id)records.push({site_id:siteId,visitor_id:input.visitor_id,user_id:null,deleted_at:new Date().toISOString(),source:'request'});
    const identityRecords=userId?await userDeletionRecords(client,siteId,userId):[];
    if(userId)records.push(...identityRecords,{site_id:siteId,visitor_id:`user:${userId}`,user_id:userId,deleted_at:new Date().toISOString(),source:'user'});
    await appendJournal(ctx.config.dataDir,records,client);
    const cutoverRepair=await captureCanonicalCutoverPrivacyRepair(client,siteId,ctx.config.dataDir,records);
    const capturedFacts=await captureFactDeletionMetadata(client,siteId,records.filter(r=>r.source==='identity-segment'||!r.visitor_id.startsWith('user:')).map(r=>({visitorId:r.visitor_id,from:r.started_at,to:r.ended_at})));
    const handledCarry=await eraseRemainingPhysical(client,ctx.pool,siteId,records,ctx.config.dataDir);
    await eraseSessionCarrySegments(client,siteId,records.filter(r=>!handledCarry.includes(r.visitor_id)&&(r.source==='identity-segment'||!r.visitor_id.startsWith('user:'))).map(r=>({visitorId:r.visitor_id,from:r.started_at,to:r.ended_at})));
    await erasePhysicalHeaders(client,ctx.pool,siteId,records);
    await erasePhysicalFacts(client,ctx.pool,siteId,records);
    await erasePhysicalCaches(client,ctx.pool,siteId);
    await invalidateFactSegments(client,siteId,records.filter(r=>r.source==='identity-segment'||!r.visitor_id.startsWith('user:')).map(r=>({visitorId:r.visitor_id,from:r.started_at,to:r.ended_at})),{pool:ctx.pool,captured:capturedFacts,cutoverRepair:cutoverRepair??undefined});
    await eraseSessionEventHeaderSegments(client,siteId,records.filter(r=>r.source==='identity-segment'||!r.visitor_id.startsWith('user:')).map(r=>({visitorId:r.visitor_id,from:r.started_at,to:r.ended_at})));
    if(!await canonicalDeletionBarrier(ctx.pool,client,siteId,records))await ctx.clickhouseMirror?.withDeletionBarrier(client,siteId,{all:true});
    await deleteHistorySegments(client,ctx.pool,siteId,records.filter(r=>r.source==='identity-segment'||!r.visitor_id.startsWith('user:')).map(r=>({visitorId:r.visitor_id,from:r.started_at,to:r.ended_at==='infinity'?undefined:r.ended_at??undefined})));
    for(const record of records.filter(r=>r.source!=='identity-segment'))await client.query('INSERT INTO tombstones(site_id,visitor_id,user_id,deleted_at,source) VALUES($1,$2,$3,$4,$5) ON CONFLICT(site_id,visitor_id) DO UPDATE SET user_id=COALESCE(excluded.user_id,tombstones.user_id)',[siteId,record.visitor_id,record.user_id,record.deleted_at,record.source]);
    if(identityRecords.length)await purgeIdentity(client,siteId,identityRecords);
    if(visitors.length)await purge(client,siteId,visitors,ctx.config.dataDir);else await invalidateDerived(client,siteId,ctx.config.dataDir);
    await rebasePhysicalFacts(client,ctx.pool,siteId);
    await rebaseRemainingPhysical(client,ctx.pool,siteId);
    await discardStrictPublishedCarryStaging(client,ctx.pool,siteId);
    await rebaseDeletedHistory(client,ctx.pool,siteId);
    await finalizeCanonicalCutoverPrivacyRepair(client,cutoverRepair);
    return records.length;
  });const historyBackups=await cleanupHistoryBackupFiles(ctx.pool,ctx.config.dataDir,{siteId});const cleanup=await runFileCleanup(ctx,siteId);await invalidateSiteCache(ctx,siteId);await ctx.audit(actorId,siteId,'visitor.delete',{identifiers:deleted,journal:'fsync-complete'});return {deleted:true,historyBackups,identifiers:deleted,journal:'durable',fileCleanup:cleanup,aggregation:'pending-rebuild',historicalBoundary:'保留期外已无法重建，相关历史聚合标为不可用'};
}
export async function replayDeletionJournal(pool:Pool,dataDir:string,extraPath?:string,replicaBarrier?:(client:PoolClient,siteId:string)=>Promise<void>,options:{client?:PoolClient;deferFileCleanup?:boolean}={}){
  if(options.client&&!options.deferFileCleanup)throw Error('DELETION_REPLAY_TRANSACTION_REQUIRES_DEFERRED_FILE_CLEANUP');
  const prior=await (options.client??pool).query('SELECT EXISTS(SELECT 1 FROM tombstones) OR EXISTS(SELECT 1 FROM identity_tombstones) AS present');const strict=process.env.REQUIRE_DELETION_JOURNAL==='1'||prior.rows[0].present;await initializeJournal(dataDir,strict);
  const current=await readFile(join(dataDir,'tombstones.jsonl'));const records=new Map<string,DeletionRecord>();
  if(extraPath){const backup=await readFile(extraPath);journalRecords(backup);if(current.length<backup.length||!current.subarray(0,backup.length).equals(backup))throw new Error('Current deletion journal does not extend backup; recovery blocked');}
  for(const record of journalRecords(current)){const temporal=record as DeletionRecord&{started_at?:string;ended_at?:string};for(const date of [temporal.started_at,temporal.ended_at])if(date!==undefined&&date!==null&&date!=='infinity'&&!Number.isFinite(Date.parse(date)))throw new Error('Invalid deletion interval');records.set(JSON.stringify([record.site_id,record.visitor_id,record.user_id,temporal.started_at,temporal.ended_at,record.source]),record);}
  const bySite=new Map<string,DeletionRecord[]>();for(const r of records.values()){const list=bySite.get(r.site_id)??[];list.push(r);bySite.set(r.site_id,list);}
  for(const [siteId,list] of bySite){const replaySite=async(client:PoolClient)=>{
    await lockSite(client,siteId);if(!(await client.query('SELECT 1 FROM sites WHERE id=$1',[siteId])).rowCount)return;
    const cutoverRepair=await captureCanonicalCutoverPrivacyRepair(client,siteId,dataDir,list);
    await deleteHistorySegments(client,pool,siteId,list.filter(r=>r.source==='identity-segment'||!r.visitor_id.startsWith('user:')).map(r=>({visitorId:r.visitor_id,from:r.started_at,to:r.ended_at==='infinity'?undefined:r.ended_at??undefined})));
    const capturedFacts=await captureFactDeletionMetadata(client,siteId,list.filter(r=>r.source==='identity-segment'||!r.visitor_id.startsWith('user:')).map(r=>({visitorId:r.visitor_id,from:r.started_at,to:r.ended_at})));
    const handledCarry=await eraseRemainingPhysical(client,pool,siteId,list,dataDir);
    await eraseSessionCarrySegments(client,siteId,list.filter(r=>!handledCarry.includes(r.visitor_id)&&(r.source==='identity-segment'||!r.visitor_id.startsWith('user:'))).map(r=>({visitorId:r.visitor_id,from:r.started_at,to:r.ended_at})));
    await erasePhysicalHeaders(client,pool,siteId,list);
    await erasePhysicalFacts(client,pool,siteId,list);
    await erasePhysicalCaches(client,pool,siteId);
    await invalidateFactSegments(client,siteId,list.filter(r=>r.source==='identity-segment'||!r.visitor_id.startsWith('user:')).map(r=>({visitorId:r.visitor_id,from:r.started_at,to:r.ended_at})),{pool:pool,captured:capturedFacts,cutoverRepair:cutoverRepair??undefined});
    await eraseSessionEventHeaderSegments(client,siteId,list.filter(r=>r.source==='identity-segment'||!r.visitor_id.startsWith('user:')).map(r=>({visitorId:r.visitor_id,from:r.started_at,to:r.ended_at})));
    if(!await canonicalDeletionBarrier(pool,client,siteId,list))await replicaBarrier?.(client,siteId);
    let changed=false;const identityRecords=list.filter(r=>r.source==='identity-segment') as IdentityDeletionRecord[];
    for(const r of list.filter(r=>r.source!=='identity-segment')){const marker=await client.query('INSERT INTO tombstones(site_id,visitor_id,user_id,deleted_at,source) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING visitor_id',[siteId,r.visitor_id,r.user_id,r.deleted_at,'restore-replay']);if(marker.rowCount)changed=true;}
    for(const r of identityRecords){const marker=await client.query('SELECT 1 FROM identity_tombstones WHERE site_id=$1 AND visitor_id=$2 AND user_id=$3 AND started_at=$4',[siteId,r.visitor_id,r.user_id,r.started_at]);const existing=await client.query(`SELECT 1 WHERE EXISTS(SELECT 1 FROM events WHERE site_id=$1 AND visitor_id=$2 AND ts>=$3 AND ($4::timestamptz IS NULL OR ts<$4)) OR EXISTS(SELECT 1 FROM experiment_contributions WHERE site_id=$1 AND visitor_id=$2 AND ts>=$3 AND ($4::timestamptz IS NULL OR ts<$4)) OR EXISTS(SELECT 1 FROM outbox WHERE site_id=$1 AND visitor_id=$2 AND ts>=$3 AND ($4::timestamptz IS NULL OR ts<$4)) OR EXISTS(SELECT 1 FROM event_keys WHERE site_id=$1 AND visitor_id=$2 AND ts>=$3 AND ($4::timestamptz IS NULL OR ts<$4)) OR EXISTS(SELECT 1 FROM experiment_assignments a JOIN experiments e ON e.id=a.experiment_id WHERE e.site_id=$1 AND a.visitor_id=$2 AND a.converted IS DISTINCT FROM EXISTS(SELECT 1 FROM experiment_contributions c WHERE c.experiment_id=a.experiment_id AND c.visitor_id=a.visitor_id))`,[siteId,r.visitor_id,r.started_at,r.ended_at]);if(!marker.rowCount||existing.rowCount){await purgeIdentity(client,siteId,[r]);changed=true;}}
    const visitors=list.filter(r=>r.source!=='identity-segment'&&!r.visitor_id.startsWith('user:')).map(r=>r.visitor_id);
    const existing=visitors.length?await client.query('SELECT 1 FROM events WHERE site_id=$1 AND visitor_id=ANY($2::text[]) LIMIT 1',[siteId,visitors]):null;
    if(existing?.rowCount){await purge(client,siteId,visitors,dataDir);changed=false;}
    if(changed)await invalidateDerived(client,siteId,dataDir);
    await purgeProvenanceSegments(client,siteId,list.filter(r=>r.source==='identity-segment'||!r.visitor_id.startsWith('user:')).map(r=>({visitorId:r.visitor_id,from:r.started_at,to:r.ended_at==='infinity'?undefined:r.ended_at??undefined})));
    await purgeIncrementalVisitorMetadata(client,siteId,list.filter(r=>r.source==='identity-segment'||!r.visitor_id.startsWith('user:')).map(r=>r.visitor_id));
    // Old backups can restore derived data even when all tombstones already exist.
    await invalidateSiteAi(client,siteId);
    const relational=Boolean((await client.query("SELECT 1 FROM analytics_fact_runs WHERE site_id=$1 AND query_version=2 AND status='published' LIMIT 1",[siteId])).rowCount);if(relational)await rebasePublishedFactEpoch(client,siteId);else await invalidateSiteFacts(client,siteId);
    await rebaseSessionCarryEpoch(client,siteId);
    await rebaseHeaderPublishedEpoch(client,siteId);
    await rebasePhysicalFacts(client,pool,siteId);
    await rebaseRemainingPhysical(client,pool,siteId);
    await discardStrictPublishedCarryStaging(client,pool,siteId);
    await rebaseDeletedHistory(client,pool,siteId);
    await finalizeCanonicalCutoverPrivacyRepair(client,cutoverRepair);
  };if(options.client)await replaySite(options.client);else await transaction(pool,replaySite);}
  if(!options.deferFileCleanup){const historyCleanup=await cleanupHistoryBackupFiles(pool,dataDir);if(historyCleanup.pending)throw Error('History backup cleanup pending; queries remain closed');}return {records:records.size,sites:[...bySite.keys()]};
}

/** Operator restore keeps all imported sidecars invisible until this exact
 * journal replay commits. Records are verified again against independent fsync
 * metadata; caller-supplied records cannot create deletion authorization.
 * Physical backup-file cleanup must run after commit before serving traffic. */
export async function replayVerifiedDeletionRecordsInTransaction(client:PoolClient,pool:Pool,dataDir:string,verifiedRecords:DeletionRecord[]){
  const current=await readVerifiedDeletionRecords(dataDir);
  const key=(r:DeletionRecord)=>JSON.stringify([r.site_id,r.visitor_id,r.user_id,r.deleted_at,r.source,r.started_at??null,r.ended_at??null]);
  const actual=new Set(current.map(key));
  if(verifiedRecords.some(record=>!actual.has(key(record))))throw Error('DELETION_AUTHORIZATION_JOURNAL_REQUIRED');
  // Replay the complete current journal, including records appended after the
  // package was captured, rather than trusting an incomplete supplied subset.
  return replayDeletionJournal(pool,dataDir,undefined,undefined,{client,deferFileCleanup:true});
}
