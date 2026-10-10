import type {Pool} from 'pg';
import {getCacheStore} from './cache-store.js';
/** One bounded sweep per invocation. Retry metadata survives the failed transaction.
 * Uses the held client only; never borrows a second connection under a site gate. */
export async function cleanupCacheStoreOrphans(pool:Pool){
 const store=getCacheStore(pool);if(!store)return {skipped:true};
 const client=await pool.connect();let siteId:string|undefined;
 try{
  await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  const acquired=(await client.query("SELECT pg_try_advisory_xact_lock(hashtextextended('cache-store-orphan-maintenance',0)) AS acquired")).rows[0]?.acquired;
  if(!acquired){await client.query('COMMIT');return {skipped:true};}
  siteId=(await client.query('SELECT s.id FROM sites s LEFT JOIN analytics_cache_gc g ON g.site_id=s.id WHERE g.site_id IS NULL OR g.next_attempt_at<=now() ORDER BY g.updated_at ASC NULLS FIRST,s.id LIMIT 1')).rows[0]?.id;
  if(!siteId){await client.query('COMMIT');return {skipped:true};}
  const result=await store.pruneOrphans(client,siteId);await client.query('COMMIT');return result;
 }catch{
  await client.query('ROLLBACK');
  if(siteId)await client.query("INSERT INTO analytics_cache_gc(site_id,attempts,next_attempt_at,last_error_code) VALUES($1,1,now()+interval '1 minute','cache_gc_failed') ON CONFLICT(site_id) DO UPDATE SET attempts=analytics_cache_gc.attempts+1,next_attempt_at=now()+make_interval(secs=>LEAST(3600,60*power(2,LEAST(analytics_cache_gc.attempts,6)))::integer),last_error_code='cache_gc_failed',updated_at=now()",[siteId]);
  return {failed:true};
 }finally{client.release();}
}
