import {stageSessionEventHeaders,type SessionEventHeader,type SessionEventHeaderRecord} from './session-event-headers.js';
import type {PoolClient} from 'pg';
import type {AnalyticsEvent} from './analytics.js';
export interface FactEffectSink {
 onRun(run:string):Promise<void>;
 onEffect(event:AnalyticsEvent,sessionId:string,metric:string,key:string[],value:number,member:boolean):Promise<void>;
 onEvent(event:AnalyticsEvent,sessionId:string):Promise<void>;
 removeOrphan(sessionId:string):Promise<void>;
 flush():Promise<void>;
}
interface Effect {event_id:string;event_ts:Date|string;session_id:string;visitor_id:string;event_path:string;dimensions:Record<string,string>;metric:string;key:string[];value:number;member:boolean}
interface Vital {event_id:string;event_ts:Date|string;event_path:string;dimensions:Record<string,string>;metric:string;value:number}
/** Bounded write buffers; exact visitor identities stay in SQL, never a runtime cardinality set. */
export function createFactEffectSink(client:PoolClient,retainedFrom:Date,options:{publishHeaders?:(runId:string,rows:SessionEventHeaderRecord[])=>Promise<void>}={}):FactEffectSink{
 let run:string|undefined;let effects:Effect[]=[],vitals:Vital[]=[],headers:SessionEventHeader[]=[];
 const flush=async()=>{if(!run)throw Error('FACT_PROVENANCE_RUN_MISSING');if(headers.length){await stageSessionEventHeaders(client,headers[0]!.event.site_id,run,headers,options.publishHeaders?rows=>options.publishHeaders!(run!,rows):undefined);headers=[];}if(effects.length){await client.query(`INSERT INTO analytics_effect_facts SELECT $1::uuid,event_id,event_ts,session_id,visitor_id,event_path,dimensions,metric,key,sum(value),member FROM jsonb_to_recordset($2) AS f(event_id uuid,event_ts timestamptz,session_id uuid,visitor_id text,event_path text,dimensions jsonb,metric text,key jsonb,value double precision,member boolean) GROUP BY event_id,event_ts,session_id,visitor_id,event_path,dimensions,metric,key,member ON CONFLICT(run_id,event_id,session_id,metric,key,member) DO UPDATE SET value=analytics_effect_facts.value+excluded.value`,[run,JSON.stringify(effects)]);effects=[];}if(vitals.length){await client.query(`INSERT INTO analytics_vital_samples SELECT $1::uuid,event_id,event_ts,event_path,dimensions,metric,value FROM jsonb_to_recordset($2) AS f(event_id uuid,event_ts timestamptz,event_path text,dimensions jsonb,metric text,value double precision) ON CONFLICT(run_id,event_id,metric) DO UPDATE SET event_ts=excluded.event_ts,event_path=excluded.event_path,dimensions=excluded.dimensions,value=excluded.value WHERE excluded.event_ts<analytics_vital_samples.event_ts`,[run,JSON.stringify(vitals)]);vitals=[];}};
 return {
  async onRun(id){run=id;await client.query('UPDATE analytics_fact_runs SET query_version=2,retained_from=$2 WHERE id=$1',[run,retainedFrom]);},
  async onEffect(e,sessionId,metric,key,value,member){effects.push({event_id:e.event_id,event_ts:e.ts,session_id:sessionId,visitor_id:e.visitor_id,event_path:e.path,dimensions:e.dimensions,metric,key,value,member});if(effects.length+vitals.length+headers.length>=200)await flush();},
  async onEvent(e,sessionId){headers.push({event:e,sessionId});if(headers.length+effects.length+vitals.length>=200)await flush();if(e.type!=='vitals')return;for(const [metric,value]of Object.entries((e.payload.vitals??{}) as Record<string,unknown>))if(typeof value==='number'&&Number.isFinite(value))vitals.push({event_id:e.event_id,event_ts:e.ts,event_path:e.path,dimensions:e.dimensions,metric,value});if(effects.length+vitals.length+headers.length>=200)await flush();},
  async removeOrphan(sessionId){await flush();await client.query("DELETE FROM analytics_effect_facts WHERE run_id=$1 AND session_id=$2 AND (metric='visible_ms' OR(metric='page' AND key->>1 IN('visible_ms','completed')))",[run,sessionId]);},flush
 };
}
