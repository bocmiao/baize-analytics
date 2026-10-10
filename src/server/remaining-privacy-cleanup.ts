import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import type {DeletionRecord} from './deletion.js';
import {canonical} from './security.js';
import {captureVerifiedDeletionAuthorization,assertCurrentDeletionAuthorization,verifyDeletionAuthorization} from './deletion-authorization.js';
import {carryCheckpointFromRemainingRow,exportControlledCarryProofs,verifyControlledCarryProof,type CarryAnchorProof} from './carry-provenance.js';
import {importOriginalColumnMetadata} from './canonical-shadow-provenance.js';
import {stageCarryDeletionReplacement} from './carry-deletion-replacement.js';
import type {ClickHouseRemainingFactStore,CarryRecoveryContext,RemainingFactFence} from './remaining-fact-store.js';
import type {CarryCheckpoint} from './session-carry.js';

/** Only journal-authorized deletion uses the private recovery sidecar. Ordinary
 * source reads never accept missing bodies or orphan replacement attempts. */
export async function eraseRemainingPrivateSegments(client:PoolClient,pool:Pool,store:ClickHouseRemainingFactStore,siteId:string,dataDir:string,records:DeletionRecord[],recoverPhysical:(records:DeletionRecord[])=>Promise<void>){
 const segments:{visitorId:string;from?:string;to?:string}[]=records.filter(r=>r.source==='identity-segment'||!r.visitor_id.startsWith('user:')).map(r=>({visitorId:r.visitor_id,from:r.started_at,to:r.ended_at==='infinity'?undefined:r.ended_at??undefined}));
 const full=segments.filter(s=>!s.from&&!s.to),partial=segments.filter(s=>s.from||s.to);
 if(full.length)await store.eraseSegments(client,siteId,full);
 if(!partial.length)return [] as string[];
 const authorization=await captureVerifiedDeletionAuthorization(client,siteId,dataDir,records);
 const segmentKey=(s:{visitorId:string;from?:string|Date;to?:string|Date})=>canonical({visitorId:s.visitorId,from:s.from?new Date(s.from).toISOString():null,to:s.to&&s.to!=='infinity'?new Date(s.to).toISOString():null});
 const validAuthorization=async(context?:CarryRecoveryContext)=>{assertCurrentDeletionAuthorization(client,siteId,authorization);if(context){const previous=context.authorization;await verifyDeletionAuthorization(client,siteId,previous.journalAuthorization,previous.exactSegments);const required=new Set(previous.exactSegments.map(segmentKey));const subset=records.filter(record=>(record.source==='identity-segment'||!record.visitor_id.startsWith('user:'))&&required.has(segmentKey({visitorId:record.visitor_id,from:record.started_at,to:record.ended_at??undefined})));const fresh=await captureVerifiedDeletionAuthorization(client,siteId,dataDir,subset);assertCurrentDeletionAuthorization(client,siteId,fresh);if(previous.journalAuthorization.scopeHash!==fresh.scopeHash)throw Error('REMAINING_FACT_RECOVERY_JOURNAL_SCOPE');}};
 const candidates=(await client.query(`SELECT DISTINCT ON(m.visitor_id) m.run_id,m.row_key,m.visitor_id FROM analytics_remaining_fact_members m JOIN analytics_fact_runs r ON r.id=m.run_id LEFT JOIN analytics_carry_heads h ON h.site_id=r.site_id AND h.visitor_id=m.visitor_id AND h.run_id=m.run_id WHERE r.site_id=$1 AND m.kind='carry_checkpoints' AND r.status='published' AND EXISTS(SELECT 1 FROM jsonb_to_recordset($2) s("visitorId" text,"from" timestamptz,"to" timestamptz) WHERE s."visitorId"=m.visitor_id AND(s."from" IS NULL OR m.interval_to>=s."from")AND(s."to" IS NULL OR m.interval_from<s."to")) ORDER BY m.visitor_id,(h.run_id IS NOT NULL) DESC,r.generation DESC`,[siteId,JSON.stringify(partial)])).rows;
 if(candidates.length>1000)throw Error('REMAINING_FACT_PRIVACY_SCOPE_LIMIT');
 const recovered=new Map<string,CarryRecoveryContext>();
 for(const candidate of candidates)try{recovered.set(candidate.visitor_id,await store.readCarryRecovery(client,siteId,{runId:candidate.run_id,rowKey:candidate.row_key},validAuthorization));}catch(error){if(!(error instanceof Error)||error.message!=='REMAINING_FACT_RECOVERY_UNAVAILABLE')throw error;}
 // A previous physical ACK can leave old receipts after PostgreSQL rollback.
 // Remove exactly those journal victims before reconstructing from the signed
 // replacement's surviving topology; never filter absent bodies into zero.
 if(recovered.size)await recoverPhysical(records.filter(record=>recovered.has(record.visitor_id)));
 const state=(await client.query('SELECT a.epoch,c.epoch canonical_epoch,c.deletion_epoch FROM aggregation_state a LEFT JOIN canonical_event_authority c ON c.site_id=a.site_id WHERE a.site_id=$1',[siteId])).rows[0];
 const fence:RemainingFactFence={expectedAggregationEpoch:state.epoch,expectedCanonicalEpoch:state.canonical_epoch??undefined,expectedDeletionEpoch:state.deletion_epoch===undefined?undefined:String(state.deletion_epoch),verifyLiveFence:async()=>{const now=(await client.query('SELECT epoch FROM aggregation_state WHERE site_id=$1',[siteId])).rows[0];if(now?.epoch!==state.epoch)throw Error('REMAINING_FACT_PRIVACY_EPOCH_CHANGED');}};
 for(const candidate of candidates){
  const scope=partial.filter(s=>s.visitorId===candidate.visitor_id),context=recovered.get(candidate.visitor_id);let old:CarryCheckpoint;
  if(context?.kind==='empty'){await store.eraseCarryCheckpointAfterVerifiedEmpty(client,siteId,candidate.visitor_id,async()=>validAuthorization(context),context.recoveryId);await store.eraseCarryKeysAfterReplacement(client,siteId,candidate.visitor_id,undefined,async()=>validAuthorization(context));await client.query('DELETE FROM analytics_carry_heads WHERE site_id=$1 AND visitor_id=$2',[siteId,candidate.visitor_id]);await client.query('DELETE FROM analytics_carry_checkpoints c USING analytics_fact_runs r WHERE r.id=c.run_id AND r.site_id=$1 AND c.visitor_id=$2',[siteId,candidate.visitor_id]);await client.query('DELETE FROM analytics_carry_keys c USING analytics_fact_runs r WHERE r.id=c.run_id AND r.site_id=$1 AND c.visitor_id=$2',[siteId,candidate.visitor_id]);await client.query('DELETE FROM canonical_carry_provenance p USING analytics_fact_runs r WHERE r.id=p.run_id AND r.site_id=$1 AND p.visitor_id=$2',[siteId,candidate.visitor_id]);continue;}
  if(context?.kind==='replacement'){
   old=carryCheckpointFromRemainingRow(context.record.row as unknown as Record<string,unknown>);
   const proof=context.authorization.originProof;if(old.privacyMode==='daily_salt'){if(!proof)throw Error('CARRY_PROVENANCE_UNKNOWN_LEGACY_DAILY');await verifyControlledCarryProof(client,siteId,old,proof);await importOriginalColumnMetadata(client,siteId,proof.anchor);}
   // The signed context supplies the actual source run, rather than invented
   // source_events/generation metadata. Only the target epoch/status is rebased.
   const metadata={...context.runMetadata,epoch:state.epoch,status:'staging'};
   await client.query('INSERT INTO analytics_fact_runs SELECT (jsonb_populate_record(NULL::analytics_fact_runs,$1::jsonb)).* ON CONFLICT(id) DO NOTHING',[JSON.stringify(metadata)]);
  }else{
   let selected:CarryCheckpoint|undefined;
   for await(const batch of store.streamRunRows(client,siteId,candidate.run_id,'carry_checkpoints'))for(const record of batch)if(record.visitorId===candidate.visitor_id){if(selected)throw Error('REMAINING_FACT_PRIVACY_CHECKPOINT_AMBIGUOUS');selected=carryCheckpointFromRemainingRow(record.row as unknown as Record<string,unknown>);}
   if(!selected)throw Error('REMAINING_FACT_BODY_UNAVAILABLE');old=selected;await exportControlledCarryProofs(client,siteId,[{runId:candidate.run_id,checkpoint:old}]);
  }
  const checksum=context?String((context.record.row as unknown as Record<string,unknown>).checksum):undefined;
  const replacement=await stageCarryDeletionReplacement(client,pool,store,siteId,old,scope,fence,context?{replacementRunId:context.newRun,expectedCheckpointChecksum:checksum}:{});
  if(!replacement.runId||!replacement.checkpoint){const empty=await store.persistEmptyCarryRecovery(client,siteId,{runId:candidate.run_id,rowKey:candidate.row_key},{journalAuthorization:authorization,originProof:null,exactSegments:segments},validAuthorization);await store.eraseCarryCheckpointAfterVerifiedEmpty(client,siteId,candidate.visitor_id,validAuthorization,empty.recoveryId);await store.eraseCarryKeysAfterReplacement(client,siteId,candidate.visitor_id,undefined,validAuthorization);await client.query('DELETE FROM analytics_carry_heads WHERE site_id=$1 AND visitor_id=$2',[siteId,candidate.visitor_id]);await client.query('DELETE FROM analytics_carry_checkpoints c USING analytics_fact_runs r WHERE r.id=c.run_id AND r.site_id=$1 AND c.visitor_id=$2',[siteId,candidate.visitor_id]);await client.query('DELETE FROM canonical_carry_provenance p USING analytics_fact_runs r WHERE r.id=p.run_id AND r.site_id=$1 AND p.visitor_id=$2',[siteId,candidate.visitor_id]);continue;}
  const checkpoint=replacement.checkpoint,runId=replacement.runId,[proof]=await exportControlledCarryProofs(client,siteId,[{runId,checkpoint}]);
  const verifyCheckpoint=async(record:{row:unknown},origin:unknown)=>{const actual=carryCheckpointFromRemainingRow(record.row as Record<string,unknown>);if(canonical(actual)!==canonical(checkpoint)||createHash('sha256').update(canonical({siteId,...actual})).digest('hex')!==(record.row as Record<string,unknown>).checksum)throw Error('REMAINING_FACT_PRIVACY_REPLACEMENT_DIGEST');if(actual.privacyMode==='daily_salt'){if(!origin)throw Error('CARRY_PROVENANCE_UNKNOWN_LEGACY_DAILY');await verifyControlledCarryProof(client,siteId,actual,origin as CarryAnchorProof);}};
  if(!context)await store.persistCarryRecovery(client,siteId,{runId:candidate.run_id,rowKey:candidate.row_key},runId,{journalAuthorization:authorization,originProof:proof??null,exactSegments:segments},validAuthorization,verifyCheckpoint);
  await store.eraseCarryCheckpointAfterReplacement(client,siteId,candidate.visitor_id,runId,async()=>{await validAuthorization();await exportControlledCarryProofs(client,siteId,[{runId,checkpoint}]);});
  await store.eraseCarryKeysAfterReplacement(client,siteId,candidate.visitor_id,runId,async()=>{await validAuthorization();await exportControlledCarryProofs(client,siteId,[{runId,checkpoint}]);});
  await client.query('DELETE FROM analytics_carry_keys c USING analytics_fact_runs r WHERE r.id=c.run_id AND r.site_id=$1 AND c.visitor_id=$2 AND c.run_id<>$3',[siteId,candidate.visitor_id,runId]);
  await client.query('DELETE FROM analytics_carry_checkpoints c USING analytics_fact_runs r WHERE r.id=c.run_id AND r.site_id=$1 AND c.visitor_id=$2 AND c.run_id<>$3',[siteId,candidate.visitor_id,runId]);
  await client.query('DELETE FROM canonical_carry_provenance p USING analytics_fact_runs r WHERE r.id=p.run_id AND r.site_id=$1 AND p.visitor_id=$2 AND p.run_id<>$3',[siteId,candidate.visitor_id,runId]);
  await client.query("UPDATE analytics_fact_runs SET status='published' WHERE id=$1 AND status='ready'",[runId]);
  await client.query('INSERT INTO analytics_carry_heads(site_id,visitor_id,run_id,epoch,generation) SELECT site_id,$2,id,epoch,generation FROM analytics_fact_runs WHERE id=$1 ON CONFLICT(site_id,visitor_id) DO UPDATE SET run_id=excluded.run_id,epoch=excluded.epoch,generation=excluded.generation',[runId,candidate.visitor_id]);
 }
 await store.eraseSessionDerived(client,siteId,partial);await store.eraseCarryKeys(client,siteId,partial.filter(segment=>!candidates.some(candidate=>candidate.visitor_id===segment.visitorId)));return candidates.map(candidate=>String(candidate.visitor_id));
}
