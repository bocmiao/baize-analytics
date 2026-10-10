import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {stableIdentityKey} from '../../packages/tracker/src/privacy.js';
import {canonicalEventChecksum,getCanonicalStore} from './canonical-clickhouse.js';
import type {StoredEvent} from './clickhouse-store.js';
import {sanitizeDailyFactProperties} from './fact-privacy.js';
import {dirtySite} from './db.js';
export const CANONICAL_PRIVACY_POLICY_VERSION=1;
export function privacyReplacementId(id:string){const h=createHash('sha256').update(`daily-privacy-${CANONICAL_PRIVACY_POLICY_VERSION}:${id}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;}
function clean(value:unknown):unknown{if(Array.isArray(value))return value.map(clean);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!stableIdentityKey(key)).map(([key,v])=>[key,clean(v)]).filter(([,v])=>v!==undefined));if(typeof value==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))return undefined;return value;}
/** Known-key policy only: arbitrary user-authored text cannot be proven anonymous.
 * Safe daily visitor/page columns are preserved; no guessed rehashing of identities. */
export function sanitizeCanonicalDailyEvent(event:StoredEvent):StoredEvent{
 const payload=['identify','replay','heatmap'].includes(event.type)?{}:clean(event.payload) as Record<string,unknown>;
 // Required day-scoped wire metadata is not a stable custom property.
 for(const key of ['page_id','visitor_id'])if(Object.hasOwn(event.payload,key))payload[key]=key==='page_id'?event.page_id:event.visitor_id;
 const dimensions=clean(event.dimensions) as Record<string,string>;
 if(['desktop','mobile','tablet','unknown'].includes(event.dimensions.device??''))dimensions.device=event.dimensions.device!;
 return {...event,payload,dimensions};
}
/** Caller holds partition/site gates in one transaction. Replacement publication
 * is immutable, and physical old-body ACK precedes metadata commit. Original
 * accepted hashes survive as retry fences. Deterministic orphan recovery is used
 * solely for this maintenance operation, never as a query fallback. */
export async function sanitizeCanonicalSitePrivacy(client:PoolClient,pool:Pool,siteId:string){
 const site=(await client.query('SELECT privacy_mode,timezone,config FROM sites WHERE id=$1',[siteId])).rows[0];
 const authority=(await client.query('SELECT authority,epoch::text FROM canonical_event_authority WHERE site_id=$1 FOR UPDATE',[siteId])).rows[0];
 if(site?.privacy_mode!=='daily_salt'||authority?.authority!=='clickhouse')return {changed:0,verified:false};
 if(site.config?.canonical_privacy_cleanup_epoch===authority.epoch&&site.config?.canonical_privacy_cleanup_policy_version===CANONICAL_PRIVACY_POLICY_VERSION)return {changed:0,verified:true};
 const store=getCanonicalStore(pool);if(!store)throw Error('CANONICAL_PRIVACY_STORE_REQUIRED');
 // A stable legacy visitor cannot be reconstructed without its original IP.
 // Reject before touching CH, rather than relabeling a person with a guessed salt.
 const unsafe=(await client.query(`SELECT 1 FROM canonical_event_members WHERE site_id=$1 GROUP BY visitor_id HAVING count(DISTINCT (ts AT TIME ZONE $2)::date)>1 LIMIT 1`,[siteId,site.timezone])).rowCount;
 if(unsafe)throw Error('CANONICAL_PRIVACY_LEGACY_VISITOR_UNAVAILABLE');
 const cursor=`privacy_${createHash('sha256').update(siteId).digest('hex').slice(0,16)}`,plan=`${cursor}_plan`;
 await client.query(`CREATE TEMP TABLE ${plan}(old_id uuid PRIMARY KEY,original boolean,body jsonb) ON COMMIT DROP`);
 await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT event_id::text FROM canonical_event_members WHERE site_id=$1 ORDER BY event_id`,[siteId]);
 try{while(true){const keys=(await client.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows;if(!keys.length)break;for(const key of keys){const original=await store.readAnyVerifiedEvent(siteId,key.event_id);let source=original,id=privacyReplacementId(key.event_id);for(let depth=0;!source&&depth<64;depth++){source=await store.readAnyVerifiedEvent(siteId,id);if(!source)id=privacyReplacementId(id);}if(!source)throw Error('CANONICAL_PRIVACY_SOURCE_UNAVAILABLE');await client.query(`INSERT INTO ${plan}(old_id,original,body) VALUES($1,$2,$3)`,[key.event_id,Boolean(original),source]);}}}finally{await client.query(`CLOSE ${cursor}`);}
 const unsafePage=(await client.query(`SELECT 1 FROM ${plan} GROUP BY body->>'page_id' HAVING count(DISTINCT ((body->>'ts')::timestamptz AT TIME ZONE $1)::date)>1 LIMIT 1`,[site.timezone])).rowCount;
 if(unsafePage)throw Error('CANONICAL_PRIVACY_LEGACY_PAGE_UNAVAILABLE');
 await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT old_id::text AS event_id,original,body FROM ${plan} ORDER BY old_id`);let changed=0;
 try{while(true){const keys=(await client.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows;if(!keys.length)break;
  for(const key of keys){const source=key.body as StoredEvent,original=key.original?source:null;
   const sanitized=sanitizeCanonicalDailyEvent(source);if(original&&canonicalEventChecksum(sanitized)===canonicalEventChecksum(original))continue;
   const newId=source.event_id===key.event_id?privacyReplacementId(key.event_id):canonicalEventChecksum(sanitized)===canonicalEventChecksum(source)?source.event_id:privacyReplacementId(source.event_id);
   const event={...sanitized,event_id:newId},acceptedHash=canonicalEventChecksum(event);
   await client.query('INSERT INTO event_keys(site_id,event_id,hash,ts,visitor_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(site_id,event_id) DO NOTHING',[siteId,newId,acceptedHash,event.ts,event.visitor_id]);
   const physicalId=newId===source.event_id?key.event_id:source.event_id;
   await store.publishReplayReplacement(client,siteId,authority.epoch,physicalId,{event,acceptedHash});
   if(physicalId!==key.event_id){await store.eraseEventID(siteId,key.event_id);await client.query('DELETE FROM canonical_event_members WHERE site_id=$1 AND event_id=$2',[siteId,key.event_id]);}
   await client.query('DELETE FROM outbox WHERE site_id=$1 AND event_id=$2',[siteId,key.event_id]);
   await client.query('DELETE FROM events WHERE site_id=$1 AND event_id=$2',[siteId,key.event_id]);changed++;
  }
 }}finally{await client.query(`CLOSE ${cursor}`);}
 await client.query('DELETE FROM identity_bindings WHERE site_id=$1',[siteId]);await client.query('DELETE FROM identity_map WHERE site_id=$1',[siteId]);
 await client.query('DELETE FROM replay_chunk_keys WHERE site_id=$1',[siteId]);await client.query('DELETE FROM replay_chunks WHERE site_id=$1',[siteId]);await client.query('DELETE FROM heatmap_points WHERE site_id=$1',[siteId]);
 const facts=await sanitizeDailyFactProperties(client,siteId);
 if(changed||facts.removed){await client.query('UPDATE canonical_event_authority SET deletion_epoch=deletion_epoch+1 WHERE site_id=$1',[siteId]);await dirtySite(client,siteId);}
 await client.query(`UPDATE sites SET config=config||jsonb_build_object('canonical_privacy_cleanup_epoch',$2::text,'canonical_privacy_cleanup_policy_version',$3::int) WHERE id=$1`,[siteId,authority.epoch,CANONICAL_PRIVACY_POLICY_VERSION]);
 return {changed,verified:true};
}
