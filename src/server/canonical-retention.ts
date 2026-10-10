import {pruneExpiredProvenance} from './provenance-lifecycle.js';
import {dirtySite} from './db.js';
import {retireCanonicalReplay} from './canonical-replay-retention.js';
import type {Pool,PoolClient} from 'pg';
import {getCanonicalStore} from './canonical-clickhouse.js';
import {pruneUnreferencedFactRuns} from './fact-member-query.js';
/** Caller owns partition-write gate then site gate. Physical ACK precedes metadata
 * pruning; a failed mutation rolls back PG and reads fail closed until retry. */
export async function retireCanonicalSiteEvents(client:PoolClient,pool:Pool,siteId:string,cutoff:Date){
 if(!Number.isFinite(+cutoff))throw Error('CANONICAL_RETENTION_CUTOFF_INVALID');
 const authority=(await client.query('SELECT authority FROM canonical_event_authority WHERE site_id=$1 FOR UPDATE',[siteId])).rows[0];
 if(authority?.authority!=='clickhouse')return {authority:'postgres' as const,removed:0,physicalAck:false};
 const store=getCanonicalStore(pool);if(!store)throw Error('CANONICAL_RETENTION_STORE_REQUIRED');
 await retireCanonicalReplay(client,pool,siteId);
 await store.expireBefore(siteId,cutoff);
 const removed=(await client.query('DELETE FROM canonical_event_members WHERE site_id=$1 AND ts<$2',[siteId,cutoff])).rowCount??0;
 await client.query('DELETE FROM canonical_event_batches b WHERE site_id=$1 AND NOT EXISTS(SELECT 1 FROM canonical_event_members m WHERE m.site_id=b.site_id AND m.batch_id=b.batch_id)',[siteId]);
 await client.query('DELETE FROM events WHERE site_id=$1 AND ts<$2',[siteId,cutoff]);
 await client.query('DELETE FROM revenue_orders WHERE site_id=$1 AND ts<$2',[siteId,cutoff]);
 await client.query('DELETE FROM event_keys WHERE site_id=$1 AND ts<$2',[siteId,cutoff]);
 await client.query("DELETE FROM outbox WHERE site_id=$1 AND status='done' AND ts<$2",[siteId,cutoff]);
 await pruneExpiredProvenance(client,siteId,cutoff);
 if(removed){await client.query('UPDATE canonical_event_authority SET deletion_epoch=deletion_epoch+1 WHERE site_id=$1',[siteId]);await pruneUnreferencedFactRuns(client,siteId);await dirtySite(client,siteId);}
 // Durable privacy tombstones and identity intervals intentionally survive retention.
 return {authority:'clickhouse' as const,removed,physicalAck:true};
}
