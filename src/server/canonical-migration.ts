import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {lockSite} from './db.js';
import {CanonicalClickHouse,canonicalEventChecksum} from './canonical-clickhouse.js';
import type {StoredEvent} from './clickhouse-store.js';
/** Remains false until collect/identity/delete/export/replay/restore integration is verified. */
export const CANONICAL_ACTIVATION_READY=false;
export async function shadowCanonicalBatch(client:PoolClient,store:CanonicalClickHouse,siteId:string,epoch:string){
 await lockSite(client,siteId);await client.query('INSERT INTO canonical_event_authority(site_id,epoch) VALUES($1,$2) ON CONFLICT(site_id) DO NOTHING',[siteId,epoch]);const authority=(await client.query('SELECT * FROM canonical_event_authority WHERE site_id=$1 FOR UPDATE',[siteId])).rows[0];if(authority.authority!=='postgres'||authority.epoch!==epoch)throw Error('CANONICAL_SHADOW_FENCE');
 await client.query('INSERT INTO canonical_migration_progress(site_id,epoch) VALUES($1,$2) ON CONFLICT(site_id) DO NOTHING',[siteId,epoch]);
 // Anti-join revisits late arrival with an older timestamp; cursor alone loses it.
 const rows=(await client.query('SELECT e.*,k.hash AS accepted_hash FROM events e JOIN event_keys k USING(site_id,event_id) LEFT JOIN canonical_event_members m USING(site_id,event_id) WHERE e.site_id=$1 AND m.event_id IS NULL ORDER BY e.ts,e.event_id LIMIT 1000',[siteId])).rows;
 if(!rows.length)return {remaining:false,copied:0};const input=rows.map(row=>{const {accepted_hash,...event}=row;return {event:event as StoredEvent,acceptedHash:String(accepted_hash)};});await store.publishBatch(client,siteId,randomUUID(),epoch,input);const last=input.at(-1)!.event;await client.query('UPDATE canonical_migration_progress SET shadow_ts=$2,shadow_event_id=$3,updated_at=now() WHERE site_id=$1',[siteId,last.ts,last.event_id]);return {remaining:true,copied:input.length};
}
export async function activateCanonicalAuthority(_client:PoolClient,_siteId:string):Promise<never>{throw Error('CANONICAL_INTEGRATION_NOT_READY');}
/** Bounded independently resumable pruning. Unreachable until full integration is authorized. */
export async function pruneCanonicalBatch(client:PoolClient,siteId:string,epoch:string){
 if(!CANONICAL_ACTIVATION_READY)throw Error('CANONICAL_INTEGRATION_NOT_READY');await lockSite(client,siteId);const authority=(await client.query('SELECT * FROM canonical_event_authority WHERE site_id=$1 FOR UPDATE',[siteId])).rows[0];if(authority?.authority!=='clickhouse'||authority.epoch!==epoch)throw Error('CANONICAL_PRUNE_FENCE');
 const rows=(await client.query('SELECT e.*,m.body_hash FROM events e JOIN canonical_event_members m USING(site_id,event_id) WHERE e.site_id=$1 ORDER BY e.ts,e.event_id LIMIT 1000',[siteId])).rows;for(const row of rows){const {body_hash,...event}=row;if(canonicalEventChecksum(event as StoredEvent)!==body_hash)throw Error('CANONICAL_PRUNE_CHECKSUM_FENCE');}
 for(const row of rows)await client.query('DELETE FROM events WHERE site_id=$1 AND event_id=$2 AND ts=$3',[siteId,row.event_id,row.ts]);if(rows.length){const last=rows.at(-1)!;await client.query("UPDATE canonical_migration_progress SET phase='pruning',prune_ts=$2,prune_event_id=$3,updated_at=now() WHERE site_id=$1",[siteId,last.ts,last.event_id]);await client.query('UPDATE canonical_event_authority SET raw_pruned=true WHERE site_id=$1',[siteId]);}return {pruned:rows.length};
}
