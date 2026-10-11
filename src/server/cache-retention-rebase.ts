import type {PoolClient} from 'pg';
/** Caller holds partition/site gates. Only successful raw-retention ACK may
 * advance these live references; immutable producer source seals stay intact. */
export async function rebaseCacheAfterRawRetention(c:PoolClient,site:string,old:{canonicalEpoch:string;deletionEpoch:string;aggregationEpoch:string},nextDeletionEpoch:string){
 if(!/^\d+$/.test(old.deletionEpoch)||!/^\d+$/.test(nextDeletionEpoch)||BigInt(nextDeletionEpoch)!==BigInt(old.deletionEpoch)+1n)throw Error('CACHE_RETENTION_REBASE_FENCE');
 const exists=(await c.query("SELECT to_regclass('analytics_cache_owners') present")).rows[0]?.present;
 if(!exists)return 0;
 const result=await c.query(`UPDATE analytics_cache_owners o SET live_deletion_epoch=$5::bigint
 FROM canonical_event_authority x,aggregation_state a
 WHERE o.site_id=$1 AND x.site_id=o.site_id AND a.site_id=o.site_id
 AND x.authority='clickhouse' AND x.epoch=$2::uuid AND x.deletion_epoch=$5::bigint
 AND a.epoch=$4::uuid AND o.aggregation_epoch=$4::uuid
 AND o.state='complete' AND o.live_canonical_epoch=$2::uuid
 AND o.live_deletion_epoch=$3::bigint`,[site,old.canonicalEpoch,old.deletionEpoch,old.aggregationEpoch,nextDeletionEpoch]);
 return result.rowCount??0;
}
