import type {PoolClient} from 'pg';
import type {CanonicalSegment} from './canonical-clickhouse.js';
export interface ReplayKeyCleanupResult {removed:number;events:{event_id:string;record_started_at:Date;record_ended_at:Date;crossesBoundary:boolean}[];physicalErasure:false}
/** Index invalidation only. Canonical replay remains disabled until body-level
 * redaction/physical ACK and mixed-identity restoration have been validated. */
export async function removeReplayKeySegments(client:PoolClient,siteId:string,segments:CanonicalSegment[]):Promise<ReplayKeyCleanupResult>{
 const events:ReplayKeyCleanupResult['events']=[];
 for(const segment of segments){const from=segment.from??null,to=segment.to??null;
  const rows=(await client.query(`DELETE FROM replay_chunk_keys WHERE site_id=$1 AND visitor_id=$2 AND ($3::timestamptz IS NULL OR record_ended_at>=$3) AND ($4::timestamptz IS NULL OR record_started_at<$4) RETURNING event_id,record_started_at,record_ended_at`,[siteId,segment.visitorId,from,to])).rows;
  for(const row of rows)events.push({...row,crossesBoundary:Boolean((from&&+new Date(row.record_started_at)<+new Date(from))||(to&&+new Date(row.record_ended_at)>=+new Date(to)))});
 }
 return {removed:events.length,events,physicalErasure:false};
}
export async function expireReplayKeys(client:PoolClient,siteId:string,siteRetentionDays:number,now=new Date()):Promise<ReplayKeyCleanupResult>{
 const cutoff=new Date(+now-Math.min(siteRetentionDays,30)*86400000);const rows=(await client.query('DELETE FROM replay_chunk_keys WHERE site_id=$1 AND record_started_at<$2 RETURNING event_id,record_started_at,record_ended_at',[siteId,cutoff])).rows;
 return {removed:rows.length,events:rows.map(row=>({...row,crossesBoundary:+new Date(row.record_ended_at)>=+cutoff})),physicalErasure:false};
}
