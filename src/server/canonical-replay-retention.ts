import type {Pool,PoolClient} from 'pg';
import {dirtySite,lockSite} from './db.js';
import {getCanonicalStore} from './canonical-clickhouse.js';
import {redactCanonicalReplay} from './canonical-replay-cleanup.js';
/** Caller owns partition/site gates and transaction. Existing chunk keys remain the
 * durable retry pointers until physical ACK and PG commit. Retention is time-based
 * operational policy, not a personal deletion request or fsynced deletion journal. */
export async function retireCanonicalReplay(client:PoolClient,pool:Pool,siteId:string,at=new Date()){
 if(!Number.isFinite(+at))throw Error('REPLAY_RETENTION_TIME_INVALID');
 const row=(await client.query("SELECT s.retention_days,a.authority FROM sites s LEFT JOIN canonical_event_authority a ON a.site_id=s.id WHERE s.id=$1",[siteId])).rows[0];
 if(row?.authority!=='clickhouse')return {authority:'postgres' as const,replaced:0,removed:0,physicalAck:false};
 const job=(await client.query('SELECT cutoff FROM replay_retention_jobs WHERE site_id=$1',[siteId])).rows[0];
 const cutoff=job?new Date(job.cutoff):new Date(+at-Math.min(Number(row.retention_days),30)*86400000);
 const visitors=(await client.query('SELECT DISTINCT visitor_id FROM replay_chunk_keys WHERE site_id=$1 AND record_started_at<$2 ORDER BY visitor_id LIMIT 10001',[siteId,cutoff])).rows;
 if(visitors.length>10000)throw Error('REPLAY_RETENTION_VISITOR_BUDGET');
 if(!visitors.length)return {authority:'clickhouse' as const,replaced:0,removed:0,physicalAck:true,cutoff:cutoff.toISOString()};
 if(!job)throw Error('REPLAY_RETENTION_AUTHORIZATION_REQUIRED');
 const store=getCanonicalStore(pool);if(!store)throw Error('CANONICAL_RETENTION_STORE_REQUIRED');
 const result=await redactCanonicalReplay(client,store,siteId,visitors.map(row=>({visitorId:row.visitor_id,to:cutoff.toISOString()})));
 if(result.replaced||result.removed){await client.query('UPDATE canonical_event_authority SET deletion_epoch=deletion_epoch+1 WHERE site_id=$1',[siteId]);await dirtySite(client,siteId);}
 await client.query('UPDATE replay_retention_jobs SET completed_at=$2,last_error=NULL,next_at=$2 WHERE site_id=$1',[siteId,at]);
 return {authority:'clickhouse' as const,...result,cutoff:cutoff.toISOString()};
}
/** Must run before borrowing a transaction client or holding any partition/site gate. */
export async function scheduleCanonicalReplayRetention(pool:Pool,at=new Date()){
 if(!Number.isFinite(+at))throw Error('REPLAY_RETENTION_TIME_INVALID');
 await pool.query(`INSERT INTO replay_retention_jobs(site_id,cutoff,next_at,updated_at)
 SELECT s.id,$1::timestamptz-least(s.retention_days,30)*interval '1 day',$1,$1 FROM sites s JOIN canonical_event_authority a ON a.site_id=s.id WHERE a.authority='clickhouse'
 ON CONFLICT(site_id) DO UPDATE SET cutoff=greatest(replay_retention_jobs.cutoff,excluded.cutoff),updated_at=excluded.updated_at`,[at]);
}
export async function runCanonicalReplayRetention(pool:Pool,at=new Date()){
 await scheduleCanonicalReplayRetention(pool,at);
 // Scheduling commits independently before any irreversible physical operation.
 const sites=(await pool.query("SELECT j.site_id FROM replay_retention_jobs j WHERE j.next_at<=$1 AND EXISTS(SELECT 1 FROM replay_chunk_keys k WHERE k.site_id=j.site_id AND k.record_started_at<j.cutoff) ORDER BY j.next_at,j.site_id LIMIT 20",[at])).rows;
 for(const site of sites){const c=await pool.connect();try{await c.query('BEGIN');await lockSite(c,site.site_id);const claim=(await c.query('SELECT site_id FROM replay_retention_jobs WHERE site_id=$1 AND next_at<=$2 FOR UPDATE SKIP LOCKED',[site.site_id,at])).rowCount;if(!claim){await c.query('COMMIT');continue;}await c.query('UPDATE replay_retention_jobs SET attempts=attempts+1 WHERE site_id=$1',[site.site_id]);await retireCanonicalReplay(c,pool,site.site_id,at);await c.query('COMMIT');}catch(error){await c.query('ROLLBACK');await c.query("UPDATE replay_retention_jobs SET attempts=attempts+1,last_error='replay_retention_failed',next_at=$2::timestamptz+interval '1 minute'*power(2,least(attempts,6)) WHERE site_id=$1",[site.site_id,at]);throw error;}finally{c.release();}}
}
