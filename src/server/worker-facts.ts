import {measurePerformanceStage} from './performance-observation.js';
import {getCacheStore} from './cache-store.js';
import {preserveStrictPublicationStaging} from './strict-fact-staging.js';
import {prepareRemainingFactReadSource} from './remaining-fact-source.js';
import {getRemainingFactStore} from './remaining-fact-store.js';
import {publishRemainingFactBodies} from './remaining-fact-publication.js';
import {getFactStore} from './fact-store.js';
import {publishRunFactBodies} from './fact-store-publication.js';
import {prepareFactReadSource} from './fact-store-source.js';
import {bindFactReadRelations,factReadRelations} from './fact-read-context.js';
import {assertRebuildHeaderCoverage,copyRebuiltImmutableEvidence} from './session-event-headers.js';
import {getSessionHeaderStore} from './session-header-store.js';
import {publishRunHeaders,copyClickHousePrefixHeaders} from './session-header-publication.js';
import {streamSelectedHeaders,materializeSelectedHeaderSource} from './session-header-source.js';
import {stageRetirementPrefixes} from './session-prefix-retirement.js';
import {Client,type Pool,type PoolClient} from 'pg';
import {beginPartitionSnapshot} from './db.js';
import {sessionTimeoutMs,type GoalDefinition,type FunnelDefinition} from './analytics.js';
import {captureEventReadState,streamSiteEventBatches} from './event-store.js';
import {createFactEffectSink} from './fact-provenance.js';
import {buildSessionFacts} from './session-facts.js';
import {publishSessionFacts} from './session-facts-publication.js';
import type {Claim} from './worker.js';

export interface WorkerFactHooks {afterSnapshot?:()=>Promise<void>;afterSourceStarted?:(client:PoolClient)=>Promise<void>;leaseSeconds?:number;heartbeatIntervalMs?:number}
/** Exact full-retained rebuild. One dedicated autocommit lease connection keeps max=1 source work live. */
export async function rebuildSiteFacts(pool:Pool,claim:Claim,hooks:WorkerFactHooks={}):Promise<boolean>{return measurePerformanceStage('worker_facts_wall',()=>rebuildSiteFactsInternal(pool,claim,hooks),{adapter:'facts'});}
async function rebuildSiteFactsInternal(pool:Pool,claim:Claim,hooks:WorkerFactHooks):Promise<boolean>{
 const leaseSeconds=hooks.leaseSeconds??60,intervalMs=hooks.heartbeatIntervalMs??15000;
 if(!Number.isInteger(leaseSeconds)||leaseSeconds<1||!Number.isInteger(intervalMs)||intervalMs<10||intervalMs>=leaseSeconds*1000)throw Error('WORKER_LEASE_INTERVAL_INVALID');
 const renewer=new Client({...pool.options,application_name:'baize-worker-lease',connectionTimeoutMillis:5000,query_timeout:5000});
 renewer.on('error',()=>{}); // Lost lease connectivity fails the publication fence without exposing connection details.
 let renewal:Promise<unknown>|undefined;let heartbeat:NodeJS.Timeout|undefined;
 let run:string|undefined;let options:Parameters<typeof publishSessionFacts>[1]|undefined;
 try{
 await renewer.connect();
 await renewer.query("SET statement_timeout TO '5s'");await renewer.query("SET lock_timeout TO '2s'");
 const renew=()=>renewer.query("UPDATE aggregation_state SET lease_until=clock_timestamp()+($4::int*interval '1 second') WHERE site_id=$1 AND epoch=$2 AND lease_owner=$3 AND lease_until>clock_timestamp()",[claim.site_id,claim.epoch,claim.lease_owner,leaseSeconds]);
 if(!(await renew()).rowCount)return false;
 heartbeat=setInterval(()=>{if(renewal)return;renewal=renew().catch(()=>{}).finally(()=>{renewal=undefined;});},intervalMs);heartbeat.unref();
 const source=await pool.connect();let releaseFactSource:(()=>void)|undefined;let cleanupFactSource:(()=>Promise<void>)|undefined;let cleanupHeaderSource:(()=>Promise<void>)|undefined;try{
 await beginPartitionSnapshot(source);
 const state=(await source.query('SELECT generation::text,epoch::text,lease_owner::text FROM aggregation_state WHERE site_id=$1',[claim.site_id])).rows[0];
 if(!state||state.epoch!==claim.epoch||state.lease_owner!==claim.lease_owner){await source.query('ROLLBACK');return false;}
 claim.generation=state.generation;
 const site=(await source.query('SELECT * FROM sites WHERE id=$1',[claim.site_id])).rows[0];if(!site){await source.query('ROLLBACK');return false;}
 const high=(await source.query('SELECT COALESCE(max(id),0)::text AS id FROM outbox WHERE site_id=$1',[claim.site_id])).rows[0].id;
 const goals=(await source.query('SELECT * FROM goals WHERE site_id=$1',[claim.site_id])).rows as (GoalDefinition&{name:string})[];
 const funnels=(await source.query('SELECT * FROM funnels WHERE site_id=$1',[claim.site_id])).rows as (FunnelDefinition&{name:string})[];
 new Intl.DateTimeFormat('en',{timeZone:String(site.timezone)}).format(0);
 const retainedFrom=new Date(Date.now()-Number(site.retention_days)*86400000),timezone=String(site.timezone),privacy=site.privacy_mode!=='standard';
 const strict=(await source.query("SELECT body_mode='strict' strict FROM canonical_event_authority WHERE site_id=$1",[claim.site_id])).rows[0]?.strict===true;
 const sourceState=await captureEventReadState(pool,claim.site_id,{client:source});
 const factStore=sourceState.authority==='clickhouse'?getFactStore(pool):undefined;
 const remainingStore=sourceState.authority==='clickhouse'?getRemainingFactStore(pool):undefined;
 const cacheStore=sourceState.authority==='clickhouse'?getCacheStore(pool):undefined;
 const headerStore=sourceState.authority==='clickhouse'?getSessionHeaderStore(pool):undefined;
 if(strict&&(!factStore||!remainingStore||!headerStore||!cacheStore))throw Error('FACT_STRICT_STORE_REQUIRED');
 if(sourceState.authority==='clickhouse'&&!headerStore)throw Error('SESSION_HEADER_STORE_REQUIRED');
 const verifyHeaderFence=async()=>{const live=(await renewer.query('SELECT a.epoch::text,a.lease_owner::text,a.lease_until>clock_timestamp() AS leased,c.authority,c.epoch::text AS canonical_epoch,c.deletion_epoch::text FROM aggregation_state a LEFT JOIN canonical_event_authority c ON c.site_id=a.site_id WHERE a.site_id=$1',[claim.site_id])).rows[0];if(!live||live.epoch!==claim.epoch||live.lease_owner!==claim.lease_owner||!live.leased||live.authority!=='clickhouse'||live.canonical_epoch!==sourceState.canonicalEpoch||live.deletion_epoch!==sourceState.deletionEpoch)throw Error('FACT_PUBLICATION_FENCE');};
 const hasPublished=Boolean((await source.query("SELECT 1 FROM analytics_fact_runs WHERE site_id=$1 AND query_version=2 AND status='published' LIMIT 1",[claim.site_id])).rowCount);
 if(factStore&&hasPublished){const readSource=await prepareFactReadSource(source,pool,claim.site_id,{forRebuild:true,forAuthorityTransition:true});releaseFactSource=bindFactReadRelations(source,readSource);cleanupFactSource=readSource.cleanup;}
 if(remainingStore&&hasPublished){const remainingSource=await prepareRemainingFactReadSource(source,pool,claim.site_id,{forRebuild:true,forAuthorityTransition:true});const restore=bindFactReadRelations(source,{...remainingSource,effectsRelation:factReadRelations(source).effectsRelation,vitalsRelation:factReadRelations(source).vitalsRelation});const priorRelease=releaseFactSource,priorCleanup=cleanupFactSource;releaseFactSource=()=>{restore();priorRelease?.();};cleanupFactSource=async()=>{await remainingSource.cleanup();await priorCleanup?.();};}
 // The first 036 build of an existing 033 site must bootstrap from every still
 // available source row. An older V2 run alone is not evidence of a complete prefix.
 const hasCarryBaseline=hasPublished&&Boolean((await source.query('SELECT 1 FROM analytics_session_contribution_heads WHERE site_id=$1 LIMIT 1',[claim.site_id])).rowCount);
 // Newly accepted pre-cutoff events change the prefix itself. A published
 // prefix cannot supply their immutable contributions: rebuild from bounded
 // authenticated topology plus actual source rows instead of guessing a window.
 const latePrefix=hasCarryBaseline&&Boolean((await source.query("SELECT 1 FROM outbox WHERE site_id=$1 AND id<=$2 AND status='queued' AND ts<$3 LIMIT 1",[claim.site_id,high,retainedFrom])).rowCount);
 const recover=latePrefix||Boolean((await source.query('SELECT 1 FROM analytics_session_rebuild_requests WHERE site_id=$1 LIMIT 1',[claim.site_id])).rowCount);
 if(recover)await assertRebuildHeaderCoverage(source,claim.site_id,{allSelected:latePrefix});
 const reusedHeaders=recover?await materializeSelectedHeaderSource(source,pool,claim.site_id):undefined;cleanupHeaderSource=reusedHeaders?.cleanup;
 const selectedHeaders=()=>reusedHeaders?reusedHeaders.stream():streamSelectedHeaders(source,pool,claim.site_id);
 const prefixSource=async function*(){for await(const batch of streamSiteEventBatches(pool,claim.site_id,{client:source,to:retainedFrom}))yield batch.events;for await(const events of selectedHeaders())yield events;};
 await hooks.afterSourceStarted?.(source);
 run=await measurePerformanceStage('session_build_wall',()=>buildSessionFacts(source,{siteId:claim.site_id,epoch:claim.epoch,generation:claim.generation,outboxHighWatermark:high,sourceAuthority:sourceState.authority??'postgres',canonicalEpoch:sourceState.canonicalEpoch,canonicalDeletionEpoch:sourceState.deletionEpoch},{timezone,privacy,timeoutMs:sessionTimeoutMs(site.config),goals,funnels,sessionPrefixes:hasCarryBaseline&&!recover,afterPrefixCopy:headerStore?(id,session,boundary)=>copyClickHousePrefixHeaders(source,headerStore,claim.site_id,id,session,boundary):undefined,effects:createFactEffectSink(source,retainedFrom),beforeSource:async id=>{await stageRetirementPrefixes(source,pool,claim.site_id,retainedFrom,{runId:id,source:prefixSource(),resetSeeds:recover});}},(async function*(){for await(const batch of streamSiteEventBatches(pool,claim.site_id,{client:source,...(hasCarryBaseline&&!recover?{from:retainedFrom}:{})}))yield batch.events;if(recover)for await(const events of selectedHeaders())yield events;})()),{batches:1});
 if(recover)await copyRebuiltImmutableEvidence(source,claim.site_id,run);
 if(headerStore)await publishRunHeaders(source,headerStore,claim.site_id,run,{expectedAggregationEpoch:claim.epoch,expectedCanonicalEpoch:sourceState.canonicalEpoch,expectedDeletionEpoch:sourceState.deletionEpoch,verifyLiveFence:verifyHeaderFence});
 if(factStore)await publishRunFactBodies(source,factStore,claim.site_id,run,{expectedAggregationEpoch:claim.epoch,expectedCanonicalEpoch:sourceState.canonicalEpoch,expectedDeletionEpoch:sourceState.deletionEpoch,verifyLiveFence:verifyHeaderFence});
 if(remainingStore)await publishRemainingFactBodies(source,remainingStore,claim.site_id,run,{expectedAggregationEpoch:claim.epoch,expectedCanonicalEpoch:sourceState.canonicalEpoch,expectedDeletionEpoch:sourceState.deletionEpoch,verifyLiveFence:verifyHeaderFence},headerStore);
 if(strict&&cacheStore)await cacheStore.completeOwnerKind(source,claim.site_id,run,'legacy_centroid',0,{expectedAggregationEpoch:claim.epoch,expectedGeneration:claim.generation,expectedCanonicalEpoch:sourceState.canonicalEpoch,expectedDeletionEpoch:sourceState.deletionEpoch,verifyLiveFence:verifyHeaderFence});
 options={run,leaseOwner:claim.lease_owner,retainedFrom,timezone,privacy,goals,funnels};
 const publicationStaging=strict?await preserveStrictPublicationStaging(source,claim.site_id,run):undefined;
 await source.query('COMMIT');
 if(publicationStaging){releaseFactSource?.();releaseFactSource=undefined;const restore=bindFactReadRelations(source,publicationStaging.relations);try{await hooks.afterSnapshot?.();await source.query('BEGIN');await publishSessionFacts(source,options);await source.query('COMMIT');return true;}catch(error){await source.query('ROLLBACK');throw error;}finally{restore();await publicationStaging.cleanup();}}
 }catch(error){await source.query('ROLLBACK');throw error;}finally{releaseFactSource?.();await cleanupHeaderSource?.().catch(()=>{});await cleanupFactSource?.().catch(()=>{});source.release();}
 await hooks.afterSnapshot?.();
 const publisher=await pool.connect();try{
 await publisher.query('BEGIN');await publishSessionFacts(publisher,options!);await publisher.query('COMMIT');return true;
 }catch(error){await publisher.query('ROLLBACK');if(run)await publisher.query('DELETE FROM analytics_fact_runs WHERE id=$1',[run]);if(error instanceof Error&&['FACT_PUBLICATION_FENCE','FACT_RUN_NOT_READY'].includes(error.message)){await publisher.query('UPDATE aggregation_state SET lease_until=NULL,lease_owner=NULL WHERE site_id=$1 AND lease_owner=$2',[claim.site_id,claim.lease_owner]);return false;}throw error;}finally{publisher.release();}
 }catch(error){if(run)await pool.query('DELETE FROM analytics_fact_runs WHERE id=$1',[run]);throw error;}finally{if(heartbeat)clearInterval(heartbeat);await renewal;await renewer.end().catch(()=>{});}
}
