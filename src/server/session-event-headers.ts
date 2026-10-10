import {factReadRelations,factReadSql} from './fact-read-context.js';
import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {AnalyticsEvent} from './analytics.js';
import {canonical} from './security.js';
import {readOriginalColumnMetadata} from './canonical-shadow-provenance.js';
import {sessionContributionPredicate,sessionVitalContributionPredicate} from './session-contribution-overlay.js';

export interface SessionEventHeader {event:AnalyticsEvent;sessionId:string}
export interface SessionEventHeaderRecord {run_id:string;event_id:string;session_id:string;visitor_id:string;event_ts:string|Date;page_id:string;event_type:string;event_path:string;dimensions:Record<string,string>;reducer_payload:Record<string,unknown>;body_seal:string}
/** This minimal model preserves reducer topology, not arbitrary tracker properties. */
export function sessionReducerEvent(event:AnalyticsEvent):AnalyticsEvent{
 const payload:Record<string,unknown>={};
 for(const key of ['event_name','interval_start','interval_end','visible_ms','order_id','currency','revenue'])if(event.payload[key]!==undefined)payload[key]=event.payload[key];
 const depth=(event.payload.props as Record<string,unknown>|undefined)?.depth;if(typeof depth==='number')payload.props={depth};
 return {site_id:event.site_id,event_id:event.event_id,visitor_id:event.visitor_id,page_id:event.page_id,ts:new Date(event.ts).toISOString(),type:event.type,path:event.path,dimensions:event.dimensions,payload};
}
function seal(secret:string,event:AnalyticsEvent,sessionId:string){return createHmac('sha256',secret).update(canonical(['session-reducer-topology-v1',sessionId,sessionReducerEvent(event)])).digest('hex');}
function sameSeal(expected:string,actual:string){const a=Buffer.from(expected),b=Buffer.from(actual);return a.length===b.length&&timingSafeEqual(a,b);}
function recordEvent(siteId:string,row:SessionEventHeaderRecord):AnalyticsEvent{return {site_id:siteId,event_id:row.event_id,visitor_id:row.visitor_id,page_id:row.page_id,ts:new Date(row.event_ts).toISOString(),type:row.event_type,path:row.event_path,dimensions:row.dimensions,payload:row.reducer_payload};}
/** Restore verifies the source producer HMAC; it never signs an imported public checksum. */
export async function verifySessionEventHeaderRecords(client:PoolClient,siteId:string,rows:SessionEventHeaderRecord[]){
 if(rows.length>200)throw Error('SESSION_HEADER_BATCH_LIMIT');const site=(await client.query('SELECT salt_secret FROM sites WHERE id=$1',[siteId])).rows[0];if(!site)throw Error('SESSION_HEADER_SITE_MISSING');
 for(const row of rows){const event=recordEvent(siteId,row);if(canonical(event)!==canonical(sessionReducerEvent(event))||!sameSeal(seal(site.salt_secret,event,row.session_id),row.body_seal))throw Error('SESSION_HEADER_SEAL_INVALID');}
}

/** Same captured source client, bounded producer batch, source epoch required.
 * Future CH topology backend must implement this interface before claiming PG metadata-only.
 */
export interface SessionHeaderBackend {
 stage(client:PoolClient,siteId:string,runId:string,headers:SessionEventHeader[]):Promise<void>;
 stream(client:PoolClient,siteId:string,runId:string,sessionId:string):AsyncIterable<SessionEventHeader[]>;
}
export async function stageSessionEventHeaders(client:PoolClient,siteId:string,runId:string,headers:SessionEventHeader[],publish?:(rows:SessionEventHeaderRecord[])=>Promise<void>){
 if(headers.length>200)throw Error('SESSION_HEADER_BATCH_LIMIT');if(!headers.length)return;
 const site=(await client.query("SELECT s.salt_secret,s.privacy_mode,r.epoch=a.epoch AS valid FROM sites s JOIN aggregation_state a ON a.site_id=s.id JOIN analytics_fact_runs r ON r.site_id=s.id WHERE s.id=$1 AND r.id=$2 AND r.status IN('staging','ready')",[siteId,runId])).rows[0];
 if(!site?.valid)throw Error('SESSION_HEADER_STAGE_FENCE');
 const rows=[];
 for(const header of headers){const event=sessionReducerEvent(header.event);if(event.site_id!==siteId||Buffer.byteLength(canonical(event))>16384)throw Error('SESSION_HEADER_SCOPE_OR_SIZE');
  if(site.privacy_mode==='daily_salt'){const original=await readOriginalColumnMetadata(client,siteId,event.event_id),proof=original.columnProof;if(proof.privacyMode!=='daily_salt'||proof.visitorId!==event.visitor_id||proof.pageId!==event.page_id||proof.ts!==event.ts)throw Error('SESSION_HEADER_PROVENANCE_INVALID');}
  rows.push({event_id:event.event_id,session_id:header.sessionId,visitor_id:event.visitor_id,event_ts:event.ts,page_id:event.page_id,event_type:event.type,event_path:event.path,dimensions:event.dimensions,reducer_payload:event.payload,body_seal:seal(site.salt_secret,event,header.sessionId)});
 }
 if(publish){await publish(rows.map(row=>({run_id:runId,...row})));return;}
 await client.query(`INSERT INTO analytics_session_event_headers SELECT $1::uuid,h.* FROM jsonb_to_recordset($2) h(event_id uuid,session_id uuid,visitor_id text,event_ts timestamptz,page_id uuid,event_type text,event_path text,dimensions jsonb,reducer_payload jsonb,body_seal text) ON CONFLICT(run_id,event_id) DO NOTHING`,[runId,JSON.stringify(rows)]);
}

/** Same client cursor; each row's HMAC binds identity, time, topology and site. */
export async function* streamSessionEventHeaders(client:PoolClient,siteId:string,runId:string,sessionId:string){
 const site=(await client.query('SELECT salt_secret FROM sites WHERE id=$1',[siteId])).rows[0];if(!site)throw Error('SESSION_HEADER_SITE_MISSING');
 const cursor=`session_headers_${randomUUID().replaceAll('-','')}`;
 await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT h.* FROM analytics_session_event_headers h JOIN analytics_fact_runs r ON r.id=h.run_id WHERE r.site_id=$1 AND h.run_id=$2 AND h.session_id=$3 AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=$1 AND t.visitor_id=h.visitor_id) AND NOT EXISTS(SELECT 1 FROM identity_tombstones t WHERE t.site_id=$1 AND t.visitor_id=h.visitor_id AND t.started_at<=h.event_ts AND t.ended_at>h.event_ts) ORDER BY h.event_ts,h.event_id`,[siteId,runId,sessionId]);
 try{while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows;if(!rows.length)break;const result:SessionEventHeader[]=[];for(const row of rows){const event:AnalyticsEvent={site_id:siteId,event_id:row.event_id,visitor_id:row.visitor_id,page_id:row.page_id,ts:new Date(row.event_ts).toISOString(),type:row.event_type,path:row.event_path,dimensions:row.dimensions,payload:row.reducer_payload};if(canonical(event)!==canonical(sessionReducerEvent(event))||!sameSeal(seal(site.salt_secret,event,row.session_id),row.body_seal))throw Error('SESSION_HEADER_SEAL_INVALID');result.push({event,sessionId:row.session_id});}yield result;}}finally{await client.query(`CLOSE ${cursor}`);}
}

export async function eraseSessionEventHeaderSegments(client:PoolClient,siteId:string,segments:{visitorId:string;from?:string;to?:string|null}[]){
 const scope=JSON.stringify(segments.map(s=>({visitor:s.visitorId,from:s.from??null,to:s.to??null})));
 return (await client.query(`DELETE FROM analytics_session_event_headers h USING analytics_fact_runs r WHERE r.id=h.run_id AND r.site_id=$1 AND EXISTS(SELECT 1 FROM jsonb_to_recordset($2) s(visitor text,"from" timestamptz,"to" timestamptz) WHERE h.visitor_id=s.visitor AND (s."from" IS NULL OR h.event_ts>=s."from") AND (s."to" IS NULL OR h.event_ts<s."to"))`,[siteId,scope])).rowCount??0;
}
export const postgresSessionHeaderBackend:SessionHeaderBackend={stage:stageSessionEventHeaders,stream:streamSessionEventHeaders};

/** A request with incomplete legacy topology cannot be repaired by guessing an
 * event type from its reduced counters. Healthy unrelated archived owners remain.
 */
export async function assertRebuildHeaderCoverage(client:PoolClient,siteId:string,options:{allSelected?:boolean}={}){
 const missing=(await client.query(factReadSql(client,`SELECT 1 FROM analytics_effect_facts e WHERE (($2::boolean AND ${sessionContributionPredicate}) OR EXISTS(SELECT 1 FROM analytics_session_rebuild_requests q WHERE q.site_id=$1 AND q.run_id=e.run_id AND q.session_id=e.session_id)) AND e.metric='bucket' AND NOT EXISTS(SELECT 1 FROM events raw WHERE raw.site_id=$1 AND raw.event_id=e.event_id) AND NOT EXISTS(SELECT 1 FROM canonical_event_members m JOIN canonical_event_batches b USING(site_id,batch_id) JOIN canonical_event_authority a ON a.site_id=m.site_id WHERE m.site_id=$1 AND m.event_id=e.event_id AND a.authority='clickhouse' AND b.epoch=a.epoch) AND NOT EXISTS(SELECT 1 FROM analytics_session_event_headers h WHERE h.run_id=e.run_id AND h.event_id=e.event_id) AND NOT EXISTS(SELECT 1 FROM analytics_header_members m JOIN analytics_header_batches b ON b.id=m.batch_id WHERE m.run_id=e.run_id AND m.event_id=e.event_id AND b.aggregation_epoch=(SELECT epoch FROM aggregation_state WHERE site_id=$1)) LIMIT 1`),[siteId,options.allSelected===true])).rowCount;
 if(missing)throw Error('SESSION_HEADER_LEGACY_INCOMPLETE');
}

/** Owner-backed expired models, independently HMAC verified, spill sorted in SQL.
 * Real retained bodies are supplied first by the caller and win event-id dedupe.
 */
export async function* streamPublishedSessionHeaderEvents(client:PoolClient,siteId:string){
 const cursor=`published_headers_${randomUUID().replaceAll('-','')}`;
 await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT e.* FROM analytics_session_event_headers e WHERE ${sessionContributionPredicate} AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=$1 AND t.visitor_id=e.visitor_id) AND NOT EXISTS(SELECT 1 FROM identity_tombstones t WHERE t.site_id=$1 AND t.visitor_id=e.visitor_id AND t.started_at<=e.event_ts AND t.ended_at>e.event_ts) ORDER BY e.visitor_id,e.event_ts,e.event_id`,[siteId]);
 try{while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows as SessionEventHeaderRecord[];if(!rows.length)break;await verifySessionEventHeaderRecords(client,siteId,rows);yield rows.map(row=>recordEvent(siteId,row));}}finally{await client.query(`CLOSE ${cursor}`);}
}

/** Topology deliberately omits arbitrary properties and vitals values. Retain
 * their already-sanitized immutable contributions for surviving event IDs,
 * rebinding to the newly computed session; deleted events have no target header.
 */
export async function copyRebuiltImmutableEvidence(client:PoolClient,siteId:string,runId:string){
 const relations=factReadRelations(client);
 await client.query(`INSERT INTO analytics_effect_facts SELECT $2::uuid,e.event_id,e.event_ts,h.session_id,e.visitor_id,e.event_path,e.dimensions,e.metric,e.key,e.value,e.member FROM ${relations.effectsRelation} e JOIN analytics_session_event_headers h ON h.run_id=$2 AND h.event_id=e.event_id WHERE e.metric='property' AND ${sessionContributionPredicate} ON CONFLICT DO NOTHING`,[siteId,runId]);
 await client.query(`INSERT INTO analytics_vital_samples SELECT $2::uuid,e.event_id,e.event_ts,e.event_path,e.dimensions,e.metric,e.value FROM ${relations.vitalsRelation} e JOIN analytics_session_event_headers h ON h.run_id=$2 AND h.event_id=e.event_id WHERE ${factReadSql(client,sessionVitalContributionPredicate)} ON CONFLICT DO NOTHING`,[siteId,runId]);
}
