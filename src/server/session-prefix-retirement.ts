import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {streamSiteEventBatches} from './event-store.js';
import {sessionTimeoutMs,type AnalyticsEvent,type GoalDefinition,type FunnelDefinition} from './analytics.js';
import {reduceSessionPrefix} from './session-prefix-reducer.js';
import {publishSessionCarry} from './session-carry.js';

/** Stage prefixes BEFORE physical retirement. Caller holds P -> site, clean aggregation and same client.
 * This isolated producer is not wired to retention until ownership queries and run-pruning are enabled.
 * SQL TEMP and cursors bound event/visitor buffers; no all-site event array or visitor Set is materialized.
 */
export async function stageRetirementPrefixes(client:PoolClient,pool:Pool,siteId:string,cutoff:Date,options:{runId?:string;source?:AsyncIterable<AnalyticsEvent[]>;resetSeeds?:boolean}={}){
 const site=(await client.query('SELECT s.*,a.epoch,a.generation,a.processed_generation,a.lease_until FROM sites s JOIN aggregation_state a ON a.site_id=s.id WHERE s.id=$1',[siteId])).rows[0];
 if(!site||(!options.runId&&(String(site.generation)!==String(site.processed_generation)||(site.lease_until&&+new Date(site.lease_until)>Date.now()))))throw Error('CARRY_RETIREMENT_DIRTY_FENCE');
 if(options.runId){const staged=(await client.query("SELECT 1 FROM analytics_fact_runs WHERE id=$1 AND site_id=$2 AND epoch=$3 AND generation=$4 AND status='staging'",[options.runId,siteId,site.epoch,site.generation])).rowCount;if(!staged)throw Error('CARRY_RETIREMENT_STAGE_FENCE');}
 const goals=(await client.query('SELECT * FROM goals WHERE site_id=$1',[siteId])).rows as GoalDefinition[],funnels=(await client.query('SELECT * FROM funnels WHERE site_id=$1',[siteId])).rows as FunnelDefinition[];
 const suffix=randomUUID().replaceAll('-',''),table=`prefix_source_${suffix}`,visitors=`prefix_visitors_${suffix}`,events=`prefix_events_${suffix}`;
 await client.query(`CREATE TEMP TABLE ${table}(visitor_id text,ts timestamptz,event_id uuid,body jsonb,PRIMARY KEY(visitor_id,ts,event_id),UNIQUE(event_id)) ON COMMIT DROP`);
 let count=0;
 const input=options.source??(async function*(){for await(const batch of streamSiteEventBatches(pool,siteId,{client,to:cutoff}))yield batch.events;})();
 for await(const batch of input){const events=batch.filter(e=>+new Date(e.ts)<+cutoff);if(!events.length)continue;await client.query(`INSERT INTO ${table} SELECT x->>'visitor_id',(x->>'ts')::timestamptz,(x->>'event_id')::uuid,x FROM jsonb_array_elements($1::jsonb) x ON CONFLICT DO NOTHING`,[JSON.stringify(events)]);count+=events.length;}
 count=Number((await client.query(`SELECT count(*)::text AS n FROM ${table}`)).rows[0].n);
 if(!count){await client.query(`DROP TABLE ${table}`);return {runId:null,events:0,visitors:0};}
 const run=options.runId??randomUUID();if(!options.runId)await client.query("INSERT INTO analytics_fact_runs(id,site_id,epoch,generation,outbox_high_watermark,status) VALUES($1,$2,$3,$4,0,'staging')",[run,siteId,site.epoch,site.processed_generation]);
 await client.query(`DECLARE ${visitors} NO SCROLL CURSOR FOR SELECT DISTINCT visitor_id FROM ${table} ORDER BY visitor_id`);let visitorCount=0;
 try{while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${visitors}`)).rows;if(!rows.length)break;for(const row of rows){
  await client.query(`DECLARE ${events} NO SCROLL CURSOR FOR SELECT body FROM ${table} WHERE visitor_id=$1 ORDER BY ts,event_id`,[row.visitor_id]);
  try{const source=async function*(){while(true){const chunk=(await client.query(`FETCH FORWARD 100 FROM ${events}`)).rows;if(!chunk.length)break;for(const item of chunk)yield item.body as AnalyticsEvent;}};
   await reduceSessionPrefix(client,{siteId,runId:run,visitorId:row.visitor_id,timezone:site.timezone,privacyMode:site.privacy_mode,timeoutMs:sessionTimeoutMs(site.config),goals,funnels,ignorePublishedSeed:options.resetSeeds},source());visitorCount++;
  }finally{await client.query(`CLOSE ${events}`);}
 }}}finally{await client.query(`CLOSE ${visitors}`);}
 if(!options.runId){await client.query("UPDATE analytics_fact_runs SET status='published',source_events=$2 WHERE id=$1",[run,count]);await publishSessionCarry(client,siteId,run);}await client.query(`DROP TABLE ${table}`);return {runId:run,events:count,visitors:visitorCount};
}
