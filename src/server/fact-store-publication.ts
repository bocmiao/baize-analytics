import {assertVerifiedFactBackup,type VerifiedFactBackup} from './fact-backup-readiness.js';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {SessionHeaderStageFence} from './session-header-store.js';

type FactPrimitive=string|number|boolean|null;
export interface EffectStoreRow {run_id:string;event_id:string;event_ts:Date|string;session_id:string;visitor_id:string;event_path:string;dimensions:Record<string,FactPrimitive>;metric:string;key:FactPrimitive[];value:number;member:boolean}
export interface VitalStoreRow {run_id:string;event_id:string;event_ts:Date|string;event_path:string;dimensions:Record<string,FactPrimitive>;metric:string;value:number}
export interface FactStoreTransportRecord {row:EffectStoreRow|VitalStoreRow;visitorId:string;sessionId:string}
export interface FactPublicationStore {
 completeRunKind(client:PoolClient,siteId:string,runId:string,kind:'effects'|'vitals',fence:SessionHeaderStageFence):Promise<unknown>;
 stageRecords(client:PoolClient,siteId:string,runId:string,kind:'effects'|'vitals',records:FactStoreTransportRecord[],fence:SessionHeaderStageFence):Promise<unknown>;
}

/** Shadow publication initially retains PG authority. Trimming the immutable
 * body is an explicit caller decision after every consumer/backup is installed.
 * A source transaction, fresh deletion fence and backend barrier are required.
 */
export async function publishRunFactBodies(client:PoolClient,store:FactPublicationStore,siteId:string,runId:string,fence:SessionHeaderStageFence){
 const cursor='fact_publish_'+randomUUID().replaceAll('-','');
 await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT * FROM analytics_effect_facts WHERE run_id=$1 ORDER BY event_id,session_id,metric,key,member`,[runId]);
 try{while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows as EffectStoreRow[];if(!rows.length)break;await store.stageRecords(client,siteId,runId,'effects',rows.map(row=>({row,visitorId:row.visitor_id,sessionId:row.session_id})),fence);}}finally{await client.query(`CLOSE ${cursor}`);}
 // An empty kind still needs a durable migration marker, never infer successful
 // migration from the absence of records after pruning.
 await store.completeRunKind(client,siteId,runId,'effects',fence);
 const vitals='vital_publish_'+randomUUID().replaceAll('-','');
 await client.query(`DECLARE ${vitals} NO SCROLL CURSOR FOR SELECT v.*,owner.visitor_id AS transport_visitor,owner.session_id AS transport_session FROM analytics_vital_samples v LEFT JOIN LATERAL(SELECT visitor_id,session_id FROM analytics_effect_facts e WHERE e.run_id=v.run_id AND e.event_id=v.event_id ORDER BY session_id LIMIT 1) owner ON true WHERE v.run_id=$1 ORDER BY v.event_id,v.metric`,[runId]);
 try{while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${vitals}`)).rows;if(!rows.length)break;const records:FactStoreTransportRecord[]=rows.map(({transport_visitor,transport_session,...row})=>{if(!transport_visitor||!transport_session)throw Error('FACT_STORE_VITAL_OWNER_MISSING');return {row:row as VitalStoreRow,visitorId:transport_visitor,sessionId:transport_session};});await store.stageRecords(client,siteId,runId,'vitals',records,fence);}}finally{await client.query(`CLOSE ${vitals}`);}
 await store.completeRunKind(client,siteId,runId,'vitals',fence);
}

/** Cutting PG bodies is a separate transaction step after publication and a
 * concrete verified backup capability check. It never changes authority or
 * silently falls back to PG if the committed CH body is later unavailable.
 */
export async function prunePublishedFactBodies(client:PoolClient,siteId:string,runId:string,proof:VerifiedFactBackup){
 const ready=(await client.query(`SELECT r.id FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id WHERE r.id=$1 AND r.site_id=$2 AND r.status='published' AND r.epoch=a.epoch AND (SELECT count(*) FROM analytics_fact_store_runs m WHERE m.run_id=r.id AND m.site_id=r.site_id AND m.state='complete' AND m.aggregation_epoch=r.epoch)=2`,[runId,siteId])).rowCount;
 if(!ready)throw Error('FACT_STORE_PRUNE_NOT_READY');
 await assertVerifiedFactBackup(client,siteId,runId,proof);
 await client.query('DELETE FROM analytics_vital_samples WHERE run_id=$1',[runId]);
 await client.query('DELETE FROM analytics_effect_facts WHERE run_id=$1',[runId]);
}
