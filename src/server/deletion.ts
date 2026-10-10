import type { AppContext } from './context.js';
import type { Pool } from 'pg';
import { mkdir,open,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { transaction,lockSite,dirtySite } from './db.js';
import { HttpError,visitorHash } from './security.js';
interface DeletionRecord {site_id:string;visitor_id:string;user_id:string|null;deleted_at:string;source:string}
export async function initializeJournal(dataDir:string){await mkdir(dataDir,{recursive:true,mode:0o700});const file=await open(join(dataDir,'tombstones.jsonl'),'a',0o600);await file.sync();await file.close();const dir=await open(dataDir,'r');try{await dir.sync();}finally{await dir.close();}}
async function appendJournal(dataDir:string,records:DeletionRecord[]){await initializeJournal(dataDir);const file=await open(join(dataDir,'tombstones.jsonl'),'a',0o600);try{await file.write(records.map(r=>JSON.stringify(r)+'\n').join(''));await file.sync();}finally{await file.close();}}
async function purge(client:any,siteId:string,visitors:string[]){
  await client.query('DELETE FROM events WHERE site_id=$1 AND visitor_id=ANY($2::text[])',[siteId,visitors]);
  for(const table of ['event_keys','outbox','identity_map','visitor_first_seen','sessions'])await client.query(`DELETE FROM ${table} WHERE site_id=$1 AND visitor_id=ANY($2::text[])`,[siteId,visitors]);
  await client.query('DELETE FROM experiment_assignments WHERE visitor_id=ANY($2::text[]) AND experiment_id IN(SELECT id FROM experiments WHERE site_id=$1)',[siteId,visitors]);
  await client.query('DELETE FROM replay_chunks WHERE site_id=$1',[siteId]);
  // Aggregate membership and sketches are not subtractable. Rebuild retained data; hide unrecoverable historical buckets.
  for(const table of ['stats_hourly','stats_daily','page_vitals','analytics_definitions','heatmap_points'])await client.query(`DELETE FROM ${table} WHERE site_id=$1`,[siteId]);
  await client.query("UPDATE sites SET config=config||jsonb_build_object('deletion_boundary','已删除派生结果，保留期内将完整重算；超过保留期的历史统计不可恢复') WHERE id=$1",[siteId]);
  await client.query('UPDATE aggregation_state SET epoch=gen_random_uuid(),lease_owner=NULL,lease_until=NULL,processed_generation=0,watermark=NULL WHERE site_id=$1',[siteId]);
  await dirtySite(client,siteId);
  // Completed exports can contain deleted personal data; revoke every downloadable export for this site.
  await client.query("UPDATE export_jobs SET status='revoked',path=NULL WHERE site_id=$1",[siteId]);
}
export async function invalidateSiteCache(ctx:AppContext,siteId:string){if(!ctx.redis)return;for(const prefix of [`analytics:${siteId}:*`,`baize:online:${siteId}:*`]){let cursor='0';do{const r=await ctx.redis.scan(cursor,'MATCH',prefix,'COUNT',100);cursor=r[0];if(r[1].length)await ctx.redis.del(...r[1]);}while(cursor!=='0');}}
export async function deleteVisitor(ctx:AppContext,siteId:string,input:{visitor_id?:string;user_id?:string},actorId:string|null){
  const deleted=await transaction(ctx.pool,async client=>{await lockSite(client,siteId);const site=(await client.query('SELECT salt_secret,privacy_mode FROM sites WHERE id=$1',[siteId])).rows[0];if(!site)throw new HttpError(404,'站点不存在');if(site.privacy_mode==='daily_salt'&&input.user_id)throw new HttpError(400,'每日盐模式不支持跨日身份关联');const userId=input.user_id?visitorHash(site.salt_secret,'identity',input.user_id,''):null;
    const set=new Set<string>(input.visitor_id?[input.visitor_id]:[]);if(userId){for(const r of(await client.query('SELECT visitor_id FROM identity_map WHERE site_id=$1 AND user_id=$2',[siteId,userId])).rows)set.add(r.visitor_id);set.add(`user:${userId}`);}
    if(!set.size)throw new HttpError(400,'需要访客或用户标识');const records=[...set].map(visitor_id=>({site_id:siteId,visitor_id,user_id:userId,deleted_at:new Date().toISOString(),source:'request'}));
    await appendJournal(ctx.config.dataDir,records); // Fail closed: never announce completion before independent durable journal.
    for(const record of records)await client.query('INSERT INTO tombstones(site_id,visitor_id,user_id,deleted_at,source) VALUES($1,$2,$3,$4,$5) ON CONFLICT(site_id,visitor_id) DO UPDATE SET user_id=COALESCE(excluded.user_id,tombstones.user_id)',[siteId,record.visitor_id,userId,record.deleted_at,record.source]);
    await purge(client,siteId,[...set]);return set.size;
  });await invalidateSiteCache(ctx,siteId);await ctx.audit(actorId,siteId,'visitor.delete',{identifiers:deleted,journal:'fsync-complete'});return {deleted:true,identifiers:deleted,journal:'durable',aggregation:'pending-rebuild',historicalBoundary:'保留期外已无法重建，相关历史聚合标为不可用'};
}
export async function replayDeletionJournal(pool:Pool,dataDir:string,extraPath?:string){
  await initializeJournal(dataDir);const paths=[join(dataDir,'tombstones.jsonl'),...(extraPath?[extraPath]:[])];const records=new Map<string,DeletionRecord>();
  for(const path of paths){let text='';try{text=await readFile(path,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}for(const line of text.split('\n').filter(Boolean)){const record=JSON.parse(line) as DeletionRecord;if(!record.site_id||!record.visitor_id||!record.deleted_at)throw new Error('Invalid deletion journal; queries remain closed');records.set(`${record.site_id}\0${record.visitor_id}`,record);}}
  const bySite=new Map<string,DeletionRecord[]>();for(const r of records.values()){const list=bySite.get(r.site_id)??[];list.push(r);bySite.set(r.site_id,list);}
  for(const [siteId,list] of bySite)await transaction(pool,async client=>{await lockSite(client,siteId);if(!(await client.query('SELECT 1 FROM sites WHERE id=$1',[siteId])).rowCount)return;let needsPurge=false;for(const r of list){const marker=await client.query('INSERT INTO tombstones(site_id,visitor_id,user_id,deleted_at,source) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING visitor_id',[siteId,r.visitor_id,r.user_id,r.deleted_at,'restore-replay']);if(marker.rowCount)needsPurge=true;}
    const existing=await client.query('SELECT 1 FROM events WHERE site_id=$1 AND visitor_id=ANY($2::text[]) LIMIT 1',[siteId,list.map(r=>r.visitor_id)]);if(needsPurge||existing.rowCount)await purge(client,siteId,list.map(r=>r.visitor_id));
  });return {records:records.size,sites:[...bySite.keys()]};
}
