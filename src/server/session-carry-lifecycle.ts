import {eraseSessionEventHeaderSegments} from './session-event-headers.js';
import {refreshControlledCarryProvenance} from './carry-provenance.js';
import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {canonical} from './security.js';
import type {CarryCheckpoint} from './session-carry.js';

export interface CarryDeletionSegment {visitorId:string;from?:string;to?:string|null}
/** Durable journal and P -> site lock are required. Full visitors are physically erased;
 * intersecting identity intervals erase exact key state and invalidate the irreducible summary.
 * An unavailable checkpoint is deliberately retained: absence must not invent a new anonymous lineage.
 */
export async function eraseSessionCarrySegments(client:PoolClient,siteId:string,segments:CarryDeletionSegment[]){
 await eraseSessionEventHeaderSegments(client,siteId,segments);
 let removed=0,invalidated=0;
 for(const scope of segments){
  if(!scope.from&&!scope.to){
   const result=await client.query('DELETE FROM analytics_carry_checkpoints c USING analytics_fact_runs r WHERE c.run_id=r.id AND r.site_id=$1 AND c.visitor_id=$2',[siteId,scope.visitorId]);removed+=result.rowCount??0;
   await client.query('DELETE FROM analytics_session_contribution_heads WHERE site_id=$1 AND visitor_id=$2',[siteId,scope.visitorId]);continue;
  }
  const start=scope.from??'-infinity',end=scope.to??'infinity';
  await client.query('DELETE FROM analytics_carry_keys k USING analytics_fact_runs r WHERE k.run_id=r.id AND r.site_id=$1 AND k.visitor_id=$2 AND k.last_ts >= $3::timestamptz AND k.first_ts < $4::timestamptz',[siteId,scope.visitorId,start,end]);
  const cursor=`carry_erase_${randomUUID().replaceAll('-','')}`;
  await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT c.*,c.local_day::text AS local_day_text FROM analytics_carry_checkpoints c JOIN analytics_fact_runs r ON r.id=c.run_id WHERE r.site_id=$1 AND c.visitor_id=$2 AND (c.state->>'lastActive')::timestamptz >= $3 AND (c.state->>'startedAt')::timestamptz < $4 ORDER BY c.run_id`,[siteId,scope.visitorId,start,end]);
  try{while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows;if(!rows.length)break;for(const row of rows){
   const checkpoint:CarryCheckpoint={visitorId:row.visitor_id,sessionId:row.session_id,anchorEventId:row.anchor_event_id,through:new Date(row.through_ts).toISOString(),lastEventId:row.last_event_id,privacyMode:row.privacy_mode,localDay:row.local_day_text,definitionsHash:row.definitions_hash,state:{startedAt:row.state.startedAt,lastActive:row.state.lastActive,entryPath:'',exitPath:'',pageviews:0,visibleMs:0,entryDimensions:{},hasPage:false},status:'unavailable'};
   const previous:CarryCheckpoint={...checkpoint,state:row.state,status:row.status};const checksum=createHash('sha256').update(canonical({siteId,...checkpoint})).digest('hex');await client.query("UPDATE analytics_carry_checkpoints SET status='unavailable',checksum=$3,state=$4 WHERE run_id=$1 AND visitor_id=$2",[row.run_id,row.visitor_id,checksum,checkpoint.state]);await refreshControlledCarryProvenance(client,siteId,row.run_id,previous,checkpoint);invalidated++;
  }}}finally{await client.query(`CLOSE ${cursor}`);}
 }
 return {removed,invalidated};
}

/** Restore may rebase only after the complete latest deletion journal has been verified/replayed.
 * Current aggregation generations are metadata; signed checkpoint checksum is independent of them.
 */
export async function rebaseSessionCarryEpoch(client:PoolClient,siteId:string){
 await client.query('UPDATE analytics_carry_heads h SET epoch=a.epoch,generation=LEAST(h.generation,a.processed_generation) FROM aggregation_state a WHERE h.site_id=a.site_id AND h.site_id=$1',[siteId]);
 await client.query('UPDATE analytics_session_contribution_heads h SET epoch=a.epoch,generation=LEAST(h.generation,a.processed_generation) FROM aggregation_state a WHERE h.site_id=a.site_id AND h.site_id=$1',[siteId]);
}
