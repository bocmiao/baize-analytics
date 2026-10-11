import {captureFactCoverageWitness,advanceFactCoverageWitness} from './fact-coverage-witness.js';
import {rebaseCacheAfterRawRetention} from './cache-retention-rebase.js';
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
 const authority=(await client.query('SELECT c.authority,c.epoch,c.deletion_epoch::text,a.epoch aggregation_epoch FROM canonical_event_authority c JOIN aggregation_state a ON a.site_id=c.site_id WHERE c.site_id=$1 FOR UPDATE OF c',[siteId])).rows[0];
 if(authority?.authority!=='clickhouse')return {authority:'postgres' as const,removed:0,physicalAck:false};
 const store=getCanonicalStore(pool);if(!store)throw Error('CANONICAL_RETENTION_STORE_REQUIRED');
 const coverageWitness=await captureFactCoverageWitness(client,siteId);
 await retireCanonicalReplay(client,pool,siteId);
 // Replay retention may independently advance the live deletion fence. Capture
 // the raw-TTL baseline afterwards; never bless owners stale from that phase.
 const rawFence=(await client.query('SELECT c.epoch,c.deletion_epoch::text,a.epoch aggregation_epoch FROM canonical_event_authority c JOIN aggregation_state a ON a.site_id=c.site_id WHERE c.site_id=$1',[siteId])).rows[0];
 await store.expireBefore(siteId,cutoff);
 const removed=(await client.query('DELETE FROM canonical_event_members WHERE site_id=$1 AND ts<$2',[siteId,cutoff])).rowCount??0;
 await client.query('DELETE FROM canonical_event_batches b WHERE site_id=$1 AND NOT EXISTS(SELECT 1 FROM canonical_event_members m WHERE m.site_id=b.site_id AND m.batch_id=b.batch_id)',[siteId]);
 await client.query('DELETE FROM events WHERE site_id=$1 AND ts<$2',[siteId,cutoff]);
 await client.query('DELETE FROM revenue_orders WHERE site_id=$1 AND ts<$2',[siteId,cutoff]);
 await client.query('DELETE FROM event_keys WHERE site_id=$1 AND ts<$2',[siteId,cutoff]);
 await client.query("DELETE FROM outbox WHERE site_id=$1 AND status='done' AND ts<$2",[siteId,cutoff]);
 await pruneExpiredProvenance(client,siteId,cutoff);
 if(removed){const next=(await client.query('UPDATE canonical_event_authority SET deletion_epoch=deletion_epoch+1 WHERE site_id=$1 RETURNING deletion_epoch::text',[siteId])).rows[0].deletion_epoch;await rebaseCacheAfterRawRetention(client,siteId,{canonicalEpoch:rawFence.epoch,deletionEpoch:rawFence.deletion_epoch,aggregationEpoch:rawFence.aggregation_epoch},next);await pruneUnreferencedFactRuns(client,siteId);await dirtySite(client,siteId);}
 await advanceFactCoverageWitness(client,siteId,coverageWitness,{operation:'raw_retention'});
 // Durable privacy tombstones and identity intervals intentionally survive retention.
 return {authority:'clickhouse' as const,removed,physicalAck:true};
}
