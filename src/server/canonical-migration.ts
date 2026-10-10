import {captureCanonicalCutoverReceipt} from './cutover-receipt.js';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {lockSite,dirtySite} from './db.js';
import {CanonicalClickHouse,canonicalEventChecksum} from './canonical-clickhouse.js';
import type {StoredEvent} from './clickhouse-store.js';
import {assertCanonicalShadowProvenance} from './canonical-shadow-provenance.js';
/** Mandatory real collect/identity/delete/export/replay/signed-restore paths verified.
 * Per-site validation, source closure and publication fences still gate cutover. */
export const CANONICAL_ACTIVATION_READY=true;
/** Full verification is streaming, with at most 100 PG bodies in memory.
 * Caller owns the exclusive site gate and transaction. Neither a CH orphan nor
 * an old validated generation can authorize cutover. */
export async function verifyCanonicalShadow(client:PoolClient,store:CanonicalClickHouse,siteId:string){
 await lockSite(client,siteId);
 const state=(await client.query('SELECT a.*,s.generation FROM canonical_event_authority a JOIN aggregation_state s USING(site_id) WHERE a.site_id=$1 FOR UPDATE OF a',[siteId])).rows[0];
 if(!state||state.authority!=='postgres')throw Error('CANONICAL_SHADOW_FENCE');
 const provenance=await assertCanonicalShadowProvenance(client,siteId);
 const privacyMode=(await client.query('SELECT privacy_mode FROM sites WHERE id=$1',[siteId])).rows[0].privacy_mode;
 const extra=(await client.query('SELECT 1 FROM canonical_event_members m LEFT JOIN events e USING(site_id,event_id) WHERE m.site_id=$1 AND e.event_id IS NULL LIMIT 1',[siteId])).rowCount;
 if(extra)throw Error('CANONICAL_SHADOW_STALE');
 const cursor='shadow_verify_'+randomUUID().replaceAll('-','');
 await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT e.*,m.body_hash,k.hash AS accepted_hash,b.epoch AS batch_epoch FROM events e LEFT JOIN canonical_event_members m USING(site_id,event_id) LEFT JOIN canonical_event_batches b USING(site_id,batch_id) LEFT JOIN event_keys k USING(site_id,event_id) WHERE e.site_id=$1 ORDER BY e.ts,e.event_id`,[siteId]);
 let verified=0;
 try{while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows;if(!rows.length)break;
  const published=await store.readPublishedEvents(client,siteId,rows.map(row=>row.event_id));
  for(const row of rows){const {body_hash,accepted_hash,batch_epoch,...event}=row;
   if(!body_hash||!accepted_hash||batch_epoch!==state.epoch||canonicalEventChecksum(event as StoredEvent)!==body_hash)throw Error('CANONICAL_SHADOW_CHECKSUM_FENCE');
   const body=published.get(event.event_id.toLowerCase());
   if(!body||canonicalEventChecksum(body)!==body_hash)throw Error('CANONICAL_SHADOW_BODY_UNAVAILABLE');verified++;
  }
 }}finally{await client.query(`CLOSE ${cursor}`);}
 await client.query("UPDATE canonical_migration_progress SET phase='validated',validated_generation=$2,validated_deletion_epoch=$3,validated_rows=$4,validated_at=now(),updated_at=now(),validated_privacy_mode=$6,validated_daily_columns_version=$7 WHERE site_id=$1 AND epoch=$5",[siteId,state.generation,state.deletion_epoch,verified,state.epoch,privacyMode,provenance.dailyColumnsVerified?provenance.policyVersion:null]);
 return {verified,epoch:String(state.epoch),generation:String(state.generation),deletionEpoch:String(state.deletion_epoch)};
}
export async function shadowCanonicalBatch(client:PoolClient,store:CanonicalClickHouse,siteId:string,epoch:string){
 await lockSite(client,siteId);await client.query('INSERT INTO canonical_event_authority(site_id,epoch) VALUES($1,$2) ON CONFLICT(site_id) DO NOTHING',[siteId,epoch]);const authority=(await client.query('SELECT * FROM canonical_event_authority WHERE site_id=$1 FOR UPDATE',[siteId])).rows[0];if(authority.authority!=='postgres'||authority.epoch!==epoch)throw Error('CANONICAL_SHADOW_FENCE');
 await client.query('INSERT INTO canonical_migration_progress(site_id,epoch) VALUES($1,$2) ON CONFLICT(site_id) DO NOTHING',[siteId,epoch]);
 // PG still owns every body here. Remove stale copies before cutover, and repair
 // identity/privacy rewrites that happened after the first shadow publication.
 // Physical ACK precedes replacement metadata; rollback remains fail closed.
 const stale=(await client.query('SELECT m.event_id FROM canonical_event_members m LEFT JOIN events e USING(site_id,event_id) WHERE m.site_id=$1 AND e.event_id IS NULL ORDER BY m.event_id LIMIT 1000',[siteId])).rows;
 for(const row of stale){await store.eraseEventID(siteId,row.event_id);await client.query('DELETE FROM canonical_event_members WHERE site_id=$1 AND event_id=$2',[siteId,row.event_id]);}
 if(stale.length)return {remaining:true,copied:0,removed:stale.length};
 const audit='shadow_audit_'+randomUUID().replaceAll('-','');let repaired=0;
 await client.query(`DECLARE ${audit} NO SCROLL CURSOR FOR SELECT e.*,m.body_hash,k.hash AS accepted_hash FROM events e JOIN canonical_event_members m USING(site_id,event_id) JOIN event_keys k USING(site_id,event_id) WHERE e.site_id=$1 ORDER BY e.ts,e.event_id`,[siteId]);
 try{while(repaired<1000){const rows=(await client.query(`FETCH FORWARD 100 FROM ${audit}`)).rows;if(!rows.length)break;
  for(const row of rows){const {body_hash,accepted_hash,...event}=row;const expected=canonicalEventChecksum(event as StoredEvent);let body:StoredEvent|null=null;
   try{body=await store.readPublishedEvent(client,siteId,event.event_id);}catch(error){if(!(error instanceof Error)||error.message!=='CANONICAL_UNAVAILABLE')throw error;}
   if(body_hash===expected&&body&&canonicalEventChecksum(body)===expected)continue;
   await store.eraseEventID(siteId,event.event_id);await client.query('DELETE FROM canonical_event_members WHERE site_id=$1 AND event_id=$2',[siteId,event.event_id]);
   await store.publishBatch(client,siteId,randomUUID(),epoch,[{event:event as StoredEvent,acceptedHash:String(accepted_hash)}]);repaired++;
   if(repaired===1000)break;
  }
 }}finally{await client.query(`CLOSE ${audit}`);}
 if(repaired)return {remaining:true,copied:repaired,repaired};
 // Anti-join revisits late arrival with an older timestamp; cursor alone loses it.
 const rows=(await client.query('SELECT e.*,k.hash AS accepted_hash FROM events e JOIN event_keys k USING(site_id,event_id) LEFT JOIN canonical_event_members m USING(site_id,event_id) WHERE e.site_id=$1 AND m.event_id IS NULL ORDER BY e.ts,e.event_id LIMIT 1000',[siteId])).rows;
 if(!rows.length)return {remaining:false,copied:0};const input=rows.map(row=>{const {accepted_hash,...event}=row;return {event:event as StoredEvent,acceptedHash:String(accepted_hash)};});await store.publishBatch(client,siteId,randomUUID(),epoch,input);const last=input.at(-1)!.event;await client.query('UPDATE canonical_migration_progress SET shadow_ts=$2,shadow_event_id=$3,updated_at=now() WHERE site_id=$1',[siteId,last.ts,last.event_id]);return {remaining:true,copied:input.length};
}
export async function activateCanonicalAuthority(client:PoolClient,siteId:string){
 if(!CANONICAL_ACTIVATION_READY)throw Error('CANONICAL_INTEGRATION_NOT_READY');
 await lockSite(client,siteId);
 const state=(await client.query('SELECT a.*,s.generation,p.validated_generation,p.validated_deletion_epoch,p.validated_at,p.epoch AS progress_epoch,p.validated_privacy_mode,p.validated_daily_columns_version,t.privacy_mode FROM canonical_event_authority a JOIN aggregation_state s USING(site_id) JOIN canonical_migration_progress p USING(site_id) JOIN sites t ON t.id=a.site_id WHERE a.site_id=$1 FOR UPDATE OF a',[siteId])).rows[0];
 if(!state||state.authority!=='postgres'||!state.validated_at||state.progress_epoch!==state.epoch||String(state.generation)!==String(state.validated_generation)||String(state.deletion_epoch)!==String(state.validated_deletion_epoch))throw Error('CANONICAL_VALIDATION_STALE');
 if(state.privacy_mode!==state.validated_privacy_mode||(state.privacy_mode==='daily_salt'&&state.validated_daily_columns_version!==1))throw Error('CANONICAL_PRIVACY_PROVENANCE_REQUIRED');
 await captureCanonicalCutoverReceipt(client,siteId);
 await client.query("UPDATE canonical_event_authority SET authority='clickhouse' WHERE site_id=$1",[siteId]);
 await dirtySite(client,siteId);
 return {authority:'clickhouse',epoch:String(state.epoch),rawPruned:false};
}
/** Bounded independently resumable pruning. Unreachable until full integration is authorized. */
export async function pruneCanonicalBatch(client:PoolClient,siteId:string,epoch:string,store?:CanonicalClickHouse){
 if(!CANONICAL_ACTIVATION_READY)throw Error('CANONICAL_INTEGRATION_NOT_READY');await lockSite(client,siteId);const authority=(await client.query('SELECT * FROM canonical_event_authority WHERE site_id=$1 FOR UPDATE',[siteId])).rows[0];if(authority?.authority!=='clickhouse'||authority.epoch!==epoch)throw Error('CANONICAL_PRUNE_FENCE');
 if(!store)throw Error('CANONICAL_STORE_REQUIRED');
 const rows=(await client.query('SELECT e.*,m.body_hash FROM events e JOIN canonical_event_members m USING(site_id,event_id) WHERE e.site_id=$1 ORDER BY e.ts,e.event_id LIMIT 1000',[siteId])).rows;const published=await store.readPublishedEvents(client,siteId,rows.map(row=>row.event_id));for(const row of rows){const {body_hash,...event}=row;if(canonicalEventChecksum(event as StoredEvent)!==body_hash)throw Error('CANONICAL_PRUNE_CHECKSUM_FENCE');const body=published.get(event.event_id.toLowerCase());if(!body||canonicalEventChecksum(body)!==body_hash)throw Error('CANONICAL_PRUNE_BODY_UNAVAILABLE');}
 for(const row of rows)await client.query('DELETE FROM events WHERE site_id=$1 AND event_id=$2 AND ts=$3',[siteId,row.event_id,row.ts]);if(rows.length){const last=rows.at(-1)!;await client.query("UPDATE canonical_migration_progress SET phase='pruning',prune_ts=$2,prune_event_id=$3,updated_at=now() WHERE site_id=$1",[siteId,last.ts,last.event_id]);await client.query('UPDATE canonical_event_authority SET raw_pruned=true WHERE site_id=$1',[siteId]);}
 const remaining=Boolean((await client.query('SELECT 1 FROM events WHERE site_id=$1 LIMIT 1',[siteId])).rowCount);
 if(!remaining){await client.query("UPDATE canonical_migration_progress SET phase='complete',updated_at=now() WHERE site_id=$1 AND epoch=$2",[siteId,epoch]);await client.query('UPDATE canonical_event_authority SET raw_pruned=true WHERE site_id=$1',[siteId]);}
 return {pruned:rows.length,remaining};
}
