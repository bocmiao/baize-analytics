import {readIncrementalSessionPublication} from './incremental-session-publication.js';
import {captureFactCoverageWitness,captureFullFactCoverageSource,advanceFactCoverageWitness,initializeNewSiteCoverageOrigin} from './fact-coverage-witness.js';
import {measurePerformanceStage} from './performance-observation.js';
import {factReadSql} from './fact-read-context.js';
import {discardStrictRunStaging} from './strict-fact-storage.js';
import {publishSessionCarry} from './session-carry.js';
import type {PoolClient} from 'pg';
import {carryRunReferenced} from './session-contribution-overlay.js';
import {dayOf,type GoalDefinition,type FunnelDefinition} from './analytics.js';
import {appendMissingFactHourReferences,publishFactHourReferences,pruneUnreferencedFactRuns} from './fact-member-query.js';
import {assertFactRunPublication,readFactBuckets,readFactDefinitions} from './session-facts.js';

export interface FactPublicationOptions {
 run:string;leaseOwner:string;retainedFrom:Date;timezone:string;privacy:boolean;
 goals:(GoalDefinition&{name?:string})[];funnels:(FunnelDefinition&{name?:string})[];
 maxBucketBytes?:number;
 /** Only the worker sets these after authenticating all source and producer bodies. */
 coverageTracking?:boolean;authenticatedFullProducer?:boolean;authenticatedNewSiteProducer?:boolean;coverageSnapshotAt?:Date;
}
/** Caller owns fresh BEGIN/COMMIT/ROLLBACK. All reads and writes reuse its single connection. */
export async function publishSessionFacts(client:PoolClient,options:FactPublicationOptions):Promise<void>{
 const {siteId,generation,outboxHighWatermark}=await assertFactRunPublication(client,options.run,options.leaseOwner);
 const strict=(await client.query("SELECT body_mode='strict' strict FROM canonical_event_authority WHERE site_id=$1",[siteId])).rows[0]?.strict===true;
 const relational=(await client.query('SELECT query_version FROM analytics_fact_runs WHERE id=$1',[options.run])).rows[0].query_version===2;
 const plan=await readIncrementalSessionPublication(client,siteId,options.run);const delta=plan.mode==='visitor_delta';if(delta&&(!strict||!relational))throw Error('INCREMENTAL_PUBLICATION_FENCE');
 if(options.authenticatedNewSiteProducer===true&&!delta)await initializeNewSiteCoverageOrigin(client,siteId,options.run);
 const trackCoverage=options.coverageTracking===true&&!!(await client.query("SELECT to_regclass('analytics_fact_coverage_witnesses') present")).rows[0]?.present;
 const priorCoverage=trackCoverage?await measurePerformanceStage('coverage_witness_wall',()=>captureFactCoverageWitness(client,siteId),{adapter:'facts'}):null;
 const floor=new Date(Math.floor(+options.retainedFrom/3600000)*3600000);
 const replaceHour=new Date(+floor+(+floor<+options.retainedFrom?3600000:0));
 const replaceDay=dayOf(new Date(+options.retainedFrom+86400000),options.timezone);
 if(!delta)await client.query('DELETE FROM sessions WHERE site_id=$1 AND last_active>=$2',[siteId,options.retainedFrom]);
 await client.query('DELETE FROM sessions s USING analytics_session_rebuild_requests q WHERE q.site_id=$1 AND s.site_id=q.site_id AND s.id=q.session_id',[siteId]);
 if(!strict)await client.query(`INSERT INTO sessions(id,site_id,visitor_id,started_at,last_active,entry_path,exit_path,pageviews,duration_s,visible_ms,bounced,dimensions,generation)
 SELECT session_id,$2,visitor_id,(data->>'started_at')::timestamptz,(data->>'last_active')::timestamptz,data->>'entry_path',data->>'exit_path',(data->>'pageviews')::integer,(data->>'duration_s')::double precision,(data->>'visible_ms')::double precision,(data->>'bounced')::boolean,data->'dimensions',$3
 FROM analytics_session_facts WHERE run_id=$1
 ON CONFLICT(id) DO UPDATE SET last_active=excluded.last_active,exit_path=excluded.exit_path,pageviews=excluded.pageviews,duration_s=excluded.duration_s,visible_ms=excluded.visible_ms,bounced=excluded.bounced,generation=excluded.generation`,[options.run,siteId,generation]);
 if(!delta)await client.query('DELETE FROM stats_hourly WHERE site_id=$1 AND hour>=$2',[siteId,replaceHour]);
 if(strict)await client.query(factReadSql(client,`INSERT INTO stats_hourly SELECT $2,bucket::timestamptz,'{"relationalVersion":2}'::jsonb,$4 FROM (SELECT DISTINCT bucket FROM analytics_numeric_facts WHERE run_id=$1 AND bucket_kind='hourly' UNION SELECT DISTINCT bucket FROM analytics_member_facts WHERE run_id=$1 AND bucket_kind='hourly') b WHERE bucket::timestamptz>=$3 ON CONFLICT(site_id,hour) DO UPDATE SET data=excluded.data,generation=excluded.generation`),[options.run,siteId,replaceHour,generation]);
 else for await(const {bucket,data}of readFactBuckets(client,options.run,'hourly',options.maxBucketBytes,!relational))if(+new Date(bucket)>=+replaceHour)await client.query('INSERT INTO stats_hourly VALUES($1,$2,$3,$4)',[siteId,bucket,JSON.stringify(relational?{...data,relationalVersion:2}:data),generation]);
 if(!delta)await client.query('DELETE FROM stats_daily WHERE site_id=$1 AND day>=$2',[siteId,replaceDay]);
 if(!delta)await client.query('DELETE FROM page_vitals WHERE site_id=$1 AND day>=$2',[siteId,replaceDay]);
 if(strict)await client.query(factReadSql(client,`INSERT INTO stats_daily SELECT $2,bucket::date,'{"relationalVersion":2}'::jsonb,$4 FROM (SELECT DISTINCT bucket FROM analytics_numeric_facts WHERE run_id=$1 AND bucket_kind='daily' UNION SELECT DISTINCT bucket FROM analytics_member_facts WHERE run_id=$1 AND bucket_kind='daily') b WHERE bucket>=$3 ON CONFLICT(site_id,day) DO UPDATE SET data=excluded.data,generation=excluded.generation`),[options.run,siteId,replaceDay,generation]);
 else for await(const {bucket,data}of readFactBuckets(client,options.run,'daily',options.maxBucketBytes,!relational))if(bucket>=replaceDay){await client.query('INSERT INTO stats_daily VALUES($1,$2,$3,$4)',[siteId,bucket,JSON.stringify(relational?{...data,relationalVersion:2}:data),generation]);for(const [key,digest]of Object.entries(data.vitals)){const [path,metric]=JSON.parse(key) as string[];await client.query('INSERT INTO page_vitals VALUES($1,$2,$3,$4,$5,$6)',[siteId,bucket,path,metric,JSON.stringify(digest),digest.reduce((n,c)=>n+c.n,0)]);}}
 if(!options.privacy)await client.query(factReadSql(client,`INSERT INTO visitor_first_seen(site_id,visitor_id,first_date) SELECT $2,visitor_id,min(bucket)::date FROM analytics_member_facts WHERE run_id=$1 AND bucket_kind='daily' AND metric='pageVisitor' GROUP BY visitor_id ON CONFLICT(site_id,visitor_id) DO UPDATE SET first_date=LEAST(visitor_first_seen.first_date,excluded.first_date)`),[options.run,siteId]);
 if(relational){if(delta)await appendMissingFactHourReferences(client,siteId,options.run,replaceHour);else await publishFactHourReferences(client,siteId,options.run,replaceHour);}
 if(!strict){const definitions=await readFactDefinitions(client,options.run,options.goals,options.funnels);
 await client.query('INSERT INTO analytics_definitions VALUES($1,$2,$3) ON CONFLICT(site_id) DO UPDATE SET data=excluded.data,generation=excluded.generation',[siteId,JSON.stringify(definitions),generation]);}else await client.query('DELETE FROM analytics_definitions WHERE site_id=$1',[siteId]);
 await client.query(`UPDATE aggregation_state SET processed_generation=$2,watermark=${delta?'GREATEST(watermark,(SELECT source_watermark FROM analytics_fact_runs WHERE id=$3))':'(SELECT source_watermark FROM analytics_fact_runs WHERE id=$3)'},lease_owner=NULL,lease_until=NULL,attempts=0,last_error=NULL,dead_letter_at=NULL WHERE site_id=$1`,[siteId,generation,options.run]);
 await client.query("UPDATE outbox SET status='done' WHERE site_id=$1 AND id<=$2",[siteId,outboxHighWatermark]);
 await client.query("UPDATE analytics_fact_runs SET status='published' WHERE id=$1",[options.run]);
 if(relational){await publishSessionCarry(client,siteId,options.run,options.retainedFrom,plan);await client.query(`UPDATE stats_hourly SET data=data-'relationalUnavailable' WHERE site_id=$1 AND data->>'relationalUnavailable'='identity_interval_requires_raw_session_rebuild' AND EXISTS(SELECT 1 FROM analytics_session_rebuild_requests WHERE site_id=$1)`,[siteId]);await client.query('DELETE FROM analytics_session_rebuild_requests WHERE site_id=$1',[siteId]);await pruneUnreferencedFactRuns(client,siteId);}
 const fullCoverageSource=trackCoverage&&options.authenticatedFullProducer===true&&!delta?await measurePerformanceStage('coverage_witness_wall',()=>captureFullFactCoverageSource(client,siteId,options.run),{adapter:'facts'}):undefined;
 if(strict)await discardStrictRunStaging(client,siteId,options.run);
 await client.query(`DELETE FROM analytics_fact_runs r WHERE site_id=$1 AND id<>$2 AND generation<=$3 AND status<>'staging' AND NOT EXISTS(SELECT 1 FROM analytics_relational_buckets p WHERE p.run_id=r.id) AND NOT ${carryRunReferenced}`,[siteId,options.run,generation]);
 if(trackCoverage)await measurePerformanceStage('coverage_witness_wall',()=>advanceFactCoverageWitness(client,siteId,priorCoverage,{operation:'publication',fullSource:fullCoverageSource,observedAt:options.coverageSnapshotAt?.toISOString()}),{adapter:'facts'});
}
