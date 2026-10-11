import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {canonical} from './security.js';
import {factReadRelations,hasFactReadSource} from './fact-read-context.js';
import {sessionContributionPredicate} from './session-contribution-overlay.js';
import {selectedFactRunPredicate} from './fact-run-closure.js';

export interface IncrementalSessionIdentity {
 siteId:string;epoch:string;generation:string;high:string|number;canonicalEpoch?:string;canonicalDeletionEpoch?:string|number;
 strict:boolean;enabled?:boolean;forceFullReason?:'session_rebuild_request';timezone:string;privacy:boolean;retentionDays:number;config:unknown;goals:unknown;funnels:unknown;retainedFrom:Date;
}
/** Config hash excludes capture time; changing retention or any definition forces full rebuild. */
export function incrementalSessionConfigHash(i:IncrementalSessionIdentity){return createHash('sha256').update(canonical({timezone:i.timezone,privacy:i.privacy,retentionDays:i.retentionDays,config:i.config,goals:i.goals,funnels:i.funnels})).digest('hex');}
export async function captureIncrementalSessionPlan(client:PoolClient,identity:IncrementalSessionIdentity){
 if((await client.query('SHOW transaction_isolation')).rows[0].transaction_isolation!=='repeatable read')throw Error('INCREMENTAL_PLAN_REQUIRES_RR');
 const state=(await client.query('SELECT epoch::text,generation::text,processed_generation::text,non_event_generation::text FROM aggregation_state WHERE site_id=$1',[identity.siteId])).rows[0];
 if(!state||state.epoch!==identity.epoch||state.generation!==identity.generation)throw Error('INCREMENTAL_PLAN_SNAPSHOT_MISMATCH');
 const hash=incrementalSessionConfigHash(identity),visitorTable=`incremental_visitors_${randomUUID().replaceAll('-','')}`;
 await client.query(`CREATE TEMP TABLE ${visitorTable}(visitor_id text PRIMARY KEY) ON COMMIT DROP`);
 await client.query(`INSERT INTO ${visitorTable} SELECT DISTINCT visitor_id FROM outbox WHERE site_id=$1 AND id<=$2 AND status='queued' AND visitor_id IS NOT NULL`,[identity.siteId,identity.high]);
 const parent=(await client.query(`SELECT r.id,r.epoch::text,r.generation::text,r.source_authority,r.canonical_epoch::text,r.canonical_deletion_epoch::text,r.retained_from,p.config_hash FROM analytics_fact_runs r LEFT JOIN analytics_incremental_run_plans p ON p.run_id=r.id WHERE r.site_id=$1 AND r.query_version=2 AND r.status='published' ORDER BY r.generation DESC,r.created_at DESC LIMIT 1`,[identity.siteId])).rows[0];
 let mode:'full'|'visitor_delta'='full',fallbackReason:string|null='not_strict',hydrated=false;
 const reject=(reason:string)=>{mode='full';fallbackReason=reason;};
 if(!identity.enabled)reject('feature_disabled');
 else if(identity.forceFullReason)reject(identity.forceFullReason);
 else if(identity.strict){
  if(!parent?.config_hash)reject('missing_baseline');
  else if(parent.epoch!==identity.epoch||parent.source_authority!=='clickhouse'||parent.canonical_epoch!==identity.canonicalEpoch||parent.canonical_deletion_epoch!==String(identity.canonicalDeletionEpoch))reject('source_fence');
  else if(parent.generation!==state.processed_generation||BigInt(state.non_event_generation)>BigInt(parent.generation))reject('non_event_change');
  else if(parent.config_hash!==hash)reject('configuration_change');
  else if(!(await client.query(`SELECT 1 FROM ${visitorTable} LIMIT 1`)).rowCount)reject('no_queued_visitors');
  else if((await client.query("SELECT 1 FROM outbox WHERE site_id=$1 AND id<=$2 AND status='queued' AND visitor_id IS NULL LIMIT 1",[identity.siteId,identity.high])).rowCount)reject('unknown_visitor');
  else {mode='visitor_delta';fallbackReason=null;}
 }
 return {
  get mode(){return mode;},get fallbackReason(){return fallbackReason;},parentRunId:parent?.id as string|undefined,visitorTable,
  /** Caller must first perform the unchanged complete authenticated source hydration. */
  async afterHydration(){
   if(mode==='full')return;
   if(!hasFactReadSource(client))throw Error('INCREMENTAL_PLAN_AUTHENTICATED_SOURCE_REQUIRED');hydrated=true;
   if((await client.query('SELECT 1 FROM analytics_session_rebuild_requests WHERE site_id=$1 LIMIT 1',[identity.siteId])).rowCount){reject('session_rebuild_request');return;}
   if(!parent.retained_from){reject('missing_retained_boundary');return;}
   const relations=factReadRelations(client);
   if((await client.query(`SELECT 1 FROM ${relations.effectsRelation} e WHERE ${sessionContributionPredicate} AND e.event_ts>=$2 AND e.event_ts<$3 LIMIT 1`,[identity.siteId,parent.retained_from,identity.retainedFrom])).rowCount){reject('retirement_boundary_crossed');return;}
   const missing=(await client.query(`SELECT 1 FROM ${relations.effectsRelation} e WHERE ${sessionContributionPredicate} AND NOT EXISTS(SELECT 1 FROM analytics_session_contribution_heads h JOIN analytics_fact_runs r ON r.id=h.run_id WHERE h.site_id=$1 AND h.session_id=e.session_id AND h.run_id=e.run_id AND h.visitor_id=e.visitor_id AND h.epoch=$2 AND h.generation<=$3 AND r.status='published' AND r.site_id=$1) LIMIT 1`,[identity.siteId,identity.epoch,state.processed_generation])).rowCount;
   if(missing)reject('incomplete_session_owners');
   if(mode==='visitor_delta'&&(await client.query(`WITH topology AS(SELECT m.run_id,m.session_id,m.visitor_id FROM analytics_header_members m UNION SELECT h.run_id,h.session_id,h.visitor_id FROM analytics_session_event_headers h) SELECT 1 FROM topology t JOIN analytics_fact_runs r ON r.id=t.run_id JOIN aggregation_state a ON a.site_id=r.site_id WHERE r.site_id=$1 AND ${selectedFactRunPredicate} AND NOT EXISTS(SELECT 1 FROM analytics_session_contribution_heads h WHERE h.site_id=$1 AND h.session_id=t.session_id AND h.visitor_id=t.visitor_id AND h.epoch=a.epoch AND h.generation<=a.processed_generation) LIMIT 1`,[identity.siteId])).rowCount)reject('unowned_topology_component');
  },
  async assertPublicationFence(publicationClient:PoolClient){
   if(mode==='full')return;
   const live=(await publicationClient.query(`SELECT a.epoch::text,a.generation::text,a.non_event_generation::text,v.authority,v.epoch::text AS canonical_epoch,v.deletion_epoch::text FROM aggregation_state a LEFT JOIN canonical_event_authority v ON v.site_id=a.site_id WHERE a.site_id=$1`,[identity.siteId])).rows[0];
   if(!live||live.epoch!==identity.epoch||BigInt(live.generation)<BigInt(identity.generation)||live.non_event_generation!==state.non_event_generation||live.authority!=='clickhouse'||live.canonical_epoch!==identity.canonicalEpoch||live.deletion_epoch!==String(identity.canonicalDeletionEpoch))throw Error('INCREMENTAL_PLAN_PUBLICATION_FENCE');
   if(mode==='visitor_delta'){
    const latest=(await publicationClient.query("SELECT id FROM analytics_fact_runs WHERE site_id=$1 AND query_version=2 AND status='published' ORDER BY generation DESC,created_at DESC LIMIT 1",[identity.siteId])).rows[0];
    if(latest?.id!==parent.id)throw Error('INCREMENTAL_PLAN_PARENT_FENCE');
   }
  },
  async persist(runId:string){
   if(mode==='visitor_delta'&&!hydrated)throw Error('INCREMENTAL_PLAN_AUTHENTICATED_SOURCE_REQUIRED');
   const run=(await client.query("SELECT 1 FROM analytics_fact_runs WHERE id=$1 AND site_id=$2 AND epoch=$3 AND generation=$4 AND status IN('staging','ready')",[runId,identity.siteId,identity.epoch,identity.generation])).rowCount;
   if(!run)throw Error('INCREMENTAL_PLAN_STAGE_FENCE');
   await client.query('INSERT INTO analytics_incremental_run_plans(run_id,site_id,parent_run_id,parent_generation,mode,source_generation,non_event_generation,config_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[runId,identity.siteId,parent?.id??null,parent?.generation??null,mode,identity.generation,state.non_event_generation,hash]);
   if(mode==='visitor_delta'){
    await client.query(`INSERT INTO analytics_incremental_run_visitors SELECT $1::uuid,visitor_id FROM ${visitorTable}`,[runId]);
    // This run's event count remains reducer-input cardinality; the watermark is
    // whole-site captured progress, never the maximum of a late-only subset.
    await client.query('UPDATE analytics_fact_runs SET source_watermark=GREATEST(source_watermark,(SELECT source_watermark FROM analytics_fact_runs WHERE id=$2),(SELECT max(ts) FROM outbox WHERE site_id=$3 AND id<=$4)) WHERE id=$1',[runId,parent.id,identity.siteId,identity.high]);
   }
  },
  async close(){await client.query(`DROP TABLE IF EXISTS ${visitorTable}`);}
 };
}
