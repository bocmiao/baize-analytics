import {Client,type Pool,type PoolClient} from 'pg';
import {beginPartitionSnapshot} from './db.js';
import {sessionTimeoutMs,type GoalDefinition,type FunnelDefinition} from './analytics.js';
import {captureEventReadState,streamSiteEventBatches} from './event-store.js';
import {buildSessionFacts} from './session-facts.js';
import {publishSessionFacts} from './session-facts-publication.js';
import type {Claim} from './worker.js';

export interface WorkerFactHooks {afterSnapshot?:()=>Promise<void>;afterSourceStarted?:(client:PoolClient)=>Promise<void>;leaseSeconds?:number;heartbeatIntervalMs?:number}
/** Exact full-retained rebuild. One dedicated autocommit lease connection keeps max=1 source work live. */
export async function rebuildSiteFacts(pool:Pool,claim:Claim,hooks:WorkerFactHooks={}):Promise<boolean>{
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
 const source=await pool.connect();try{
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
 const sourceState=await captureEventReadState(pool,claim.site_id,{client:source});
 await hooks.afterSourceStarted?.(source);
 run=await buildSessionFacts(source,{siteId:claim.site_id,epoch:claim.epoch,generation:claim.generation,outboxHighWatermark:high,sourceAuthority:sourceState.authority??'postgres',canonicalEpoch:sourceState.canonicalEpoch,canonicalDeletionEpoch:sourceState.deletionEpoch},{timezone,privacy,timeoutMs:sessionTimeoutMs(site.config),goals,funnels},(async function*(){for await(const batch of streamSiteEventBatches(pool,claim.site_id,{client:source,from:retainedFrom}))yield batch.events;})());
 options={run,leaseOwner:claim.lease_owner,retainedFrom,timezone,privacy,goals,funnels};
 await source.query('COMMIT');
 }catch(error){await source.query('ROLLBACK');throw error;}finally{source.release();}
 await hooks.afterSnapshot?.();
 const publisher=await pool.connect();try{
 await publisher.query('BEGIN');await publishSessionFacts(publisher,options!);await publisher.query('COMMIT');return true;
 }catch(error){await publisher.query('ROLLBACK');if(run)await publisher.query('DELETE FROM analytics_fact_runs WHERE id=$1',[run]);if(error instanceof Error&&['FACT_PUBLICATION_FENCE','FACT_RUN_NOT_READY'].includes(error.message)){await publisher.query('UPDATE aggregation_state SET lease_until=NULL,lease_owner=NULL WHERE site_id=$1 AND lease_owner=$2',[claim.site_id,claim.lease_owner]);return false;}throw error;}finally{publisher.release();}
 }catch(error){if(run)await pool.query('DELETE FROM analytics_fact_runs WHERE id=$1',[run]);throw error;}finally{if(heartbeat)clearInterval(heartbeat);await renewal;await renewer.end().catch(()=>{});}
}
