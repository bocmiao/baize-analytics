import type {PoolClient} from 'pg';
import {lockPartitionWrites} from './db.js';
/** Obtain every waiting gate before fixing RR, so completed deletion is visible. */
export async function beginSiteSnapshot(client:PoolClient,siteId:string){
 const partition="hashtextextended(current_schema()||':baize:partition-writes',92834110)";
 let heldPartition=false,heldSite=false;
 try{
  await client.query(`SELECT pg_advisory_lock_shared(${partition})`);heldPartition=true;
  await client.query('SELECT pg_advisory_lock_shared(hashtextextended($1,0))',[siteId]);heldSite=true;
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await lockPartitionWrites(client);
  await client.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))',[siteId]);
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
 finally{
  if(heldSite)await client.query('SELECT pg_advisory_unlock_shared(hashtextextended($1,0))',[siteId]);
  if(heldPartition)await client.query(`SELECT pg_advisory_unlock_shared(${partition})`);
 }
}
