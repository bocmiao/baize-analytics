import type {Pool} from 'pg';
import {lockSite,transaction} from './db.js';

/** Share the site's exclusive gate with the scheduler and notification sender.
 * Once deletion returns, unclaimed and claimed-but-unsent work is revoked. */
export async function deleteGovernanceResource(pool:Pool,siteId:string,id:string,kind:'schedules'|'channels'|'alerts'):Promise<boolean>{
 return transaction(pool,async client=>{
  await lockSite(client,siteId);
  const table={schedules:'report_schedules',channels:'notification_channels',alerts:'alert_rules'}[kind];
  const existing=await client.query(`SELECT id FROM ${table} WHERE site_id=$1 AND id=$2 FOR UPDATE`,[siteId,id]);
  if(!existing.rowCount)return false;
  if(kind==='channels'){
   await client.query("UPDATE notification_jobs SET status='revoked',lease_until=NULL,last_error='configuration_deleted' WHERE site_id=$1 AND channel_id=$2 AND status IN ('pending','running')",[siteId,id]);
   await client.query('DELETE FROM alert_rules WHERE site_id=$1 AND channel_id=$2',[siteId,id]);
   await client.query('DELETE FROM report_schedules WHERE site_id=$1 AND channel_id=$2',[siteId,id]);
  }else{
   const prefix=`${kind==='schedules'?'report':'alert'}:${id}:`;
   await client.query("UPDATE notification_jobs SET status='revoked',lease_until=NULL,last_error='configuration_deleted' WHERE site_id=$1 AND starts_with(dedupe_key,$2) AND status IN ('pending','running')",[siteId,prefix]);
  }
  await client.query(`DELETE FROM ${table} WHERE site_id=$1 AND id=$2`,[siteId,id]);
  return true;
 });
}
