import type {PoolClient} from 'pg';
export interface IdentityDeletionRecord {site_id:string;visitor_id:string;user_id:string;started_at:string;ended_at:string|null;deleted_at:string;source:'identity-segment'}
/** Caller holds the site's advisory transaction lock; temporal attribution never uses ingestion time. */
export async function checkIdentity(client:PoolClient,site:string,visitor:string,ts:number|Date,claimedUser:string|null=null,allowTransition=false){
 const at=ts instanceof Date?ts:new Date(ts);
 const deleted=await client.query(`SELECT 1 FROM tombstones WHERE site_id=$1 AND (visitor_id=$2 OR ($3::text IS NOT NULL AND user_id=$3)) UNION ALL SELECT 1 FROM identity_tombstones WHERE site_id=$1 AND visitor_id=$2 AND started_at<=$4 AND ended_at>$4 LIMIT 1`,[site,visitor,claimedUser,at]);
 if(deleted.rowCount)return {allowed:false,user_id:null,reason:'deleted_visitor'};
 const row=(await client.query('SELECT user_id FROM identity_bindings WHERE site_id=$1 AND visitor_id=$2 AND started_at<=$3 AND (ended_at IS NULL OR ended_at>$3) ORDER BY started_at DESC LIMIT 1',[site,visitor,at])).rows[0];
 const user=row?.user_id as string|undefined;
 if(user&&(await client.query('SELECT 1 FROM tombstones WHERE site_id=$1 AND user_id=$2 LIMIT 1',[site,user])).rowCount)return {allowed:false,user_id:null,reason:'deleted_visitor'};
 if(claimedUser&&!allowTransition&&claimedUser!==user)return {allowed:false,user_id:null,reason:'identity_mismatch'};
 return {allowed:true,user_id:user??null,reason:undefined};
}
/** A→B appends a new episode and closes A at B's event time; late transitions only split their temporal interval. */
export async function registerIdentity(client:PoolClient,site:string,visitor:string,user:string,ts:number|Date):Promise<boolean>{
 const at=ts instanceof Date?ts:new Date(ts);
 const existing=(await client.query('SELECT user_id FROM identity_bindings WHERE site_id=$1 AND visitor_id=$2 AND started_at=$3',[site,visitor,at])).rows[0];
 if(existing)return existing.user_id===user;
 await client.query('INSERT INTO identity_bindings(site_id,visitor_id,user_id,started_at) VALUES($1,$2,$3,$4)',[site,visitor,user,at]);
 await client.query(`WITH bounds AS(SELECT started_at,lead(started_at) OVER(ORDER BY started_at) AS next_at FROM identity_bindings WHERE site_id=$1 AND visitor_id=$2) UPDATE identity_bindings b SET ended_at=LEAST(b.ended_at,t.next_at,(SELECT min(x.started_at) FROM identity_tombstones x WHERE x.site_id=b.site_id AND x.visitor_id=b.visitor_id AND x.started_at>b.started_at)) FROM bounds t WHERE b.site_id=$1 AND b.visitor_id=$2 AND b.started_at=t.started_at`,[site,visitor]);
 const newest=(await client.query('SELECT user_id,started_at FROM identity_bindings WHERE site_id=$1 AND visitor_id=$2 ORDER BY started_at DESC LIMIT 1',[site,visitor])).rows[0];
 await client.query('INSERT INTO identity_map(site_id,visitor_id,user_id,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(site_id,visitor_id) DO UPDATE SET user_id=excluded.user_id,created_at=excluded.created_at',[site,visitor,newest.user_id,newest.started_at]);
 // Correct delayed events already accepted in the newly split interval, without relabeling earlier owners.
 await client.query(`UPDATE events e SET payload=jsonb_set(e.payload,'{user_id}',to_jsonb(b.user_id),true) FROM identity_bindings b WHERE e.site_id=$1 AND e.visitor_id=$2 AND b.site_id=e.site_id AND b.visitor_id=e.visitor_id AND e.ts>=b.started_at AND (b.ended_at IS NULL OR e.ts<b.ended_at)`,[site,visitor]);
 return true;
}
export async function userDeletionRecords(client:PoolClient,site:string,userHash:string):Promise<IdentityDeletionRecord[]>{
 const rows=(await client.query('SELECT visitor_id,started_at::text,ended_at::text FROM identity_bindings WHERE site_id=$1 AND user_id=$2 ORDER BY visitor_id,started_at',[site,userHash])).rows;
 const deleted_at=new Date().toISOString();return rows.map(row=>({site_id:site,visitor_id:row.visitor_id,user_id:userHash,started_at:row.started_at,ended_at:row.ended_at??null,deleted_at,source:'identity-segment'}));
}
/** Persist interval tombstones before precise purge. A deleted episode cannot be revived by an anonymous old retry. */
export async function purgeIdentity(client:PoolClient,site:string,records:IdentityDeletionRecord[]){
 for(const record of records){
  if(record.site_id!==site)throw Error('Identity deletion site mismatch');
  const args=[site,record.visitor_id,record.started_at,record.ended_at,record.user_id];
  await client.query(`INSERT INTO identity_tombstones(site_id,visitor_id,user_id,started_at,ended_at,deleted_at,source) VALUES($1,$2,$5,$3,COALESCE($4::timestamptz,'infinity'),$6,$7) ON CONFLICT(site_id,visitor_id,user_id,started_at) DO UPDATE SET ended_at=GREATEST(identity_tombstones.ended_at,excluded.ended_at)`,[...args,record.deleted_at,record.source]);
  // Match the immutable event timestamp even after identity projection rows were removed on restore.
  const predicate='site_id=$1 AND visitor_id=$2 AND ts>=$3 AND ($4::timestamptz IS NULL OR ts<$4)';
  // The optional revenue ledger is independently migrated; retain order B while removing only A's order keys.
  if((await client.query("SELECT to_regclass('revenue_orders') AS relation")).rows[0].relation)await client.query(`DELETE FROM revenue_orders WHERE ${predicate}`,args.slice(0,4));
  // Remove conversion facts only inside the deleted identity episode, then retain B's valid facts.
  if((await client.query("SELECT to_regclass('experiment_contributions') AS relation")).rows[0].relation){
   const affected=(await client.query(`DELETE FROM experiment_contributions WHERE ${predicate} RETURNING experiment_id`,args.slice(0,4))).rows.map(row=>row.experiment_id);
   if(affected.length)await client.query(`UPDATE experiment_assignments a SET converted=EXISTS(SELECT 1 FROM experiment_contributions c WHERE c.experiment_id=a.experiment_id AND c.visitor_id=a.visitor_id) WHERE a.visitor_id=$1 AND a.experiment_id=ANY($2::uuid[])`,[record.visitor_id,affected]);
  }
  await client.query(`DELETE FROM outbox WHERE ${predicate}`,args.slice(0,4));
  await client.query(`DELETE FROM event_keys WHERE ${predicate}`,args.slice(0,4));
  await client.query(`DELETE FROM events WHERE ${predicate}`,args.slice(0,4));
  await client.query('DELETE FROM identity_bindings WHERE site_id=$1 AND visitor_id=$2 AND user_id=$3 AND started_at=$4',[site,record.visitor_id,record.user_id,record.started_at]);
  const latest=(await client.query('SELECT user_id,started_at FROM identity_bindings WHERE site_id=$1 AND visitor_id=$2 ORDER BY started_at DESC LIMIT 1',[site,record.visitor_id])).rows[0];
  if(latest)await client.query('UPDATE identity_map SET user_id=$3,created_at=$4 WHERE site_id=$1 AND visitor_id=$2',[site,record.visitor_id,latest.user_id,latest.started_at]);else await client.query('DELETE FROM identity_map WHERE site_id=$1 AND visitor_id=$2',[site,record.visitor_id]);
  // These projections are rebuilt by deletion's generation/epoch invalidation. Preserve other visitor source events.
  await client.query('DELETE FROM sessions WHERE site_id=$1 AND visitor_id=$2',[site,record.visitor_id]);
  await client.query('DELETE FROM visitor_first_seen WHERE site_id=$1 AND visitor_id=$2',[site,record.visitor_id]);
  await client.query(`UPDATE replay_chunks r SET payload=COALESCE((SELECT jsonb_agg(e) FROM jsonb_array_elements(r.payload) e WHERE NOT ((e->>'timestamp')::numeric>=extract(epoch FROM $3::timestamptz)*1000 AND ($4::timestamptz IS NULL OR (e->>'timestamp')::numeric<extract(epoch FROM $4::timestamptz)*1000))),'[]'::jsonb) WHERE site_id=$1 AND session_id LIKE $2`,[site,record.visitor_id+':%',record.started_at,record.ended_at]);
  await client.query("DELETE FROM replay_chunks WHERE site_id=$1 AND session_id LIKE $2 AND payload='[]'::jsonb",[site,record.visitor_id+':%']);
 }
}
