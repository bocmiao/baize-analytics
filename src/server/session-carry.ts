import {readIncrementalSessionPublication,retireIncrementalVisitorOwners,type IncrementalSessionPublication} from './incremental-session-publication.js';
import {factReadRelations} from './fact-read-context.js';
import {recordControlledCarryProvenance} from './carry-provenance.js';
import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {canonical} from './security.js';

export interface CarryState {
 startedAt:string;lastActive:string;anchorPageId?:string;entryPath:string;exitPath:string;pageviews:number;visibleMs:number;
 entryDimensions:Record<string,string>;exitDimensions?:Record<string,string>;lastNonDirect?:{channel:string;path:string};
 hasPage?:boolean;previousPath?:string;firstPageAt?:string;firstPageId?:string;firstPageInstance?:string;lastPageAt?:string;lastPageId?:string;lastPageInstance?:string;
}
export interface CarryCheckpoint {
 visitorId:string;sessionId:string;anchorEventId:string;through:string;lastEventId:string;
 privacyMode:'standard'|'daily_salt';localDay:string;definitionsHash:string;
 state:CarryState;status:'valid'|'unavailable';
}
export interface CarryKey {kind:'page'|'heartbeat'|'order'|'goal'|'funnel';key:string;state:Record<string,string|number|boolean|null>;first:string;last:string}
function checksum(siteId:string,checkpoint:CarryCheckpoint){return createHash('sha256').update(canonical({siteId,...checkpoint})).digest('hex');}

/** The source transaction stages checkpoints; unpublished runs never become visible seed state. */
export async function stageSessionCarry(client:PoolClient,siteId:string,runId:string,checkpoint:CarryCheckpoint){
 const run=(await client.query("SELECT r.site_id,r.status,r.epoch::text,a.epoch::text AS live_epoch FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id WHERE r.id=$1",[runId])).rows[0];
 if(!run||run.site_id!==siteId||run.epoch!==run.live_epoch||!['staging','ready'].includes(run.status))throw Error('CARRY_STAGE_FENCE');
 const {state}=checkpoint;
 if(!Number.isFinite(+new Date(checkpoint.through))||!Number.isFinite(+new Date(state.startedAt))||!Number.isFinite(+new Date(state.lastActive))||+new Date(state.startedAt)>+new Date(state.lastActive)||+new Date(state.lastActive)>+new Date(checkpoint.through)||!Number.isSafeInteger(state.pageviews)||state.pageviews<0||!Number.isFinite(state.visibleMs)||state.visibleMs<0||Buffer.byteLength(JSON.stringify(state))>16384)throw Error('CARRY_STATE_INVALID');
 await client.query('DELETE FROM analytics_carry_keys WHERE run_id=$1 AND visitor_id=$2 AND session_id<>$3',[runId,checkpoint.visitorId,checkpoint.sessionId]);
 await client.query('INSERT INTO analytics_carry_checkpoints VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(run_id,visitor_id) DO UPDATE SET session_id=excluded.session_id,anchor_event_id=excluded.anchor_event_id,through_ts=excluded.through_ts,last_event_id=excluded.last_event_id,privacy_mode=excluded.privacy_mode,local_day=excluded.local_day,definitions_hash=excluded.definitions_hash,state=excluded.state,status=excluded.status,checksum=excluded.checksum',[runId,checkpoint.visitorId,checkpoint.sessionId,checkpoint.anchorEventId,checkpoint.through,checkpoint.lastEventId,checkpoint.privacyMode,checkpoint.localDay,checkpoint.definitionsHash,checkpoint.state,checkpoint.status,checksum(siteId,checkpoint)]);
 await recordControlledCarryProvenance(client,siteId,runId,checkpoint);
}

/** One exact dedupe/state key at a time; page/order/interval cardinality remains in spill-capable storage. */
export async function stageCarryKey(client:PoolClient,runId:string,visitorId:string,key:CarryKey){
 if(Buffer.byteLength(JSON.stringify(key.state))>4096||key.key.length>512||!Number.isFinite(+new Date(key.first))||!Number.isFinite(+new Date(key.last))||+new Date(key.first)>+new Date(key.last))throw Error('CARRY_KEY_INVALID');
 const written=await client.query("INSERT INTO analytics_carry_keys SELECT c.run_id,c.visitor_id,c.session_id,$3,$4,$5,$6,$7 FROM analytics_carry_checkpoints c JOIN analytics_fact_runs r ON r.id=c.run_id WHERE c.run_id=$1 AND c.visitor_id=$2 AND r.status IN('staging','ready') ON CONFLICT(run_id,visitor_id,kind,key) DO UPDATE SET state=excluded.state,first_ts=LEAST(analytics_carry_keys.first_ts,excluded.first_ts),last_ts=GREATEST(analytics_carry_keys.last_ts,excluded.last_ts)",[runId,visitorId,key.kind,key.key,key.state,key.first,key.last]);if(!written.rowCount)throw Error('CARRY_KEY_STAGE_FENCE');
}

/** Publication runs after the worker's fresh lease/epoch fence, under the same P -> site gate. */
export async function publishSessionCarry(client:PoolClient,siteId:string,runId:string,retainedFrom?:Date,publication?:IncrementalSessionPublication){
 const run=(await client.query("SELECT r.epoch::text,r.generation::text,s.epoch::text AS live_epoch,s.processed_generation::text FROM analytics_fact_runs r JOIN aggregation_state s ON s.site_id=r.site_id WHERE r.id=$1 AND r.site_id=$2 AND r.status='published'",[runId,siteId])).rows[0];
 if(!run||run.epoch!==run.live_epoch||run.generation!==run.processed_generation)throw Error('CARRY_PUBLICATION_FENCE');
 const plan=publication??await readIncrementalSessionPublication(client,siteId,runId);if(plan.runId!==runId||plan.siteId!==siteId)throw Error('INCREMENTAL_PUBLICATION_FENCE');await retireIncrementalVisitorOwners(client,plan,run.epoch,run.generation);
 // Retired IDs remain as empty owners of the new run, preventing old hour
 // references from resurrecting the pre-deletion session after a split.
 await client.query(`INSERT INTO analytics_session_contribution_heads SELECT DISTINCT q.site_id,q.session_id,q.visitor_id,$2::uuid,a.epoch,a.processed_generation FROM analytics_session_rebuild_requests q JOIN aggregation_state a ON a.site_id=q.site_id WHERE q.site_id=$1 AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=q.site_id AND t.visitor_id=q.visitor_id) ON CONFLICT(site_id,session_id) DO UPDATE SET run_id=excluded.run_id,epoch=excluded.epoch,generation=excluded.generation`,[siteId,runId]);
 if(retainedFrom&&plan.mode==='full')await client.query(`DELETE FROM analytics_session_contribution_heads h USING ${factReadRelations(client).sessionsRelation??'analytics_session_facts'} old WHERE h.site_id=$1 AND old.run_id=h.run_id AND old.session_id=h.session_id AND (old.data->>'last_active')::timestamptz>=$3 AND NOT EXISTS(SELECT 1 FROM analytics_session_facts current WHERE current.run_id=$2 AND current.session_id=h.session_id)`,[siteId,runId,retainedFrom]);
 await client.query(`INSERT INTO analytics_carry_heads SELECT r.site_id,c.visitor_id,r.id,r.epoch,r.generation FROM analytics_fact_runs r JOIN ${factReadRelations(client).carryCheckpointsRelation??'analytics_carry_checkpoints'} c ON c.run_id=r.id JOIN sites s ON s.id=r.site_id WHERE r.id=$1 AND c.privacy_mode=s.privacy_mode AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=r.site_id AND t.visitor_id=c.visitor_id) ON CONFLICT(site_id,visitor_id) DO UPDATE SET run_id=excluded.run_id,epoch=excluded.epoch,generation=excluded.generation WHERE analytics_carry_heads.epoch<>excluded.epoch OR analytics_carry_heads.generation<=excluded.generation`,[runId]);
 await client.query(`INSERT INTO analytics_session_contribution_heads SELECT r.site_id,f.session_id,f.visitor_id,r.id,r.epoch,r.generation FROM analytics_fact_runs r JOIN (SELECT run_id,session_id,visitor_id FROM ${factReadRelations(client).sessionsRelation??'analytics_session_facts'} UNION SELECT run_id,session_id,visitor_id FROM ${factReadRelations(client).carryCheckpointsRelation??'analytics_carry_checkpoints'} WHERE (state->>'pageviews')::int=0) f ON f.run_id=r.id WHERE r.id=$1 ON CONFLICT(site_id,session_id) DO UPDATE SET visitor_id=excluded.visitor_id,run_id=excluded.run_id,epoch=excluded.epoch,generation=excluded.generation WHERE analytics_session_contribution_heads.epoch<>excluded.epoch OR analytics_session_contribution_heads.generation<=excluded.generation`,[runId]);
}

export async function readSessionCarry(client:PoolClient,siteId:string,visitorId:string,privacyMode:'standard'|'daily_salt',localDay:string,definitionsHash:string,stagedRunId?:string):Promise<(CarryCheckpoint&{runId:string})|null>{
 const relation=factReadRelations(client).carryCheckpointsRelation??'analytics_carry_checkpoints';
 const row=(await client.query(`SELECT * FROM(SELECT c.*,c.local_day::text AS local_day_text,c.run_id::text AS selected_run_id,0 AS priority FROM analytics_carry_checkpoints c JOIN analytics_fact_runs r ON r.id=c.run_id JOIN aggregation_state a ON a.site_id=r.site_id WHERE c.run_id=$3::uuid AND c.visitor_id=$2 AND r.site_id=$1 AND r.epoch=a.epoch AND r.generation=a.generation AND r.status IN('staging','ready') AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=r.site_id AND t.visitor_id=c.visitor_id) UNION ALL SELECT c.*,c.local_day::text AS local_day_text,h.run_id::text AS selected_run_id,1 AS priority FROM analytics_carry_heads h JOIN ${relation} c ON c.run_id=h.run_id AND c.visitor_id=h.visitor_id JOIN analytics_fact_runs r ON r.id=h.run_id JOIN aggregation_state a ON a.site_id=h.site_id WHERE h.site_id=$1 AND h.visitor_id=$2 AND h.epoch=a.epoch AND h.generation<=a.processed_generation AND r.status='published' AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=h.site_id AND t.visitor_id=h.visitor_id)) candidates ORDER BY priority LIMIT 1`,[siteId,visitorId,stagedRunId??null])).rows[0];
 if(!row)return null;
 const checkpoint:CarryCheckpoint={visitorId,sessionId:row.session_id,anchorEventId:row.anchor_event_id,through:new Date(row.through_ts).toISOString(),lastEventId:row.last_event_id,privacyMode:row.privacy_mode,localDay:row.local_day_text,definitionsHash:row.definitions_hash,state:row.state,status:row.status};
 if(checksum(siteId,checkpoint)!==row.checksum)throw Error('CARRY_CHECKSUM_INVALID');
 if(checkpoint.privacyMode!==privacyMode||(privacyMode==='daily_salt'&&checkpoint.localDay!==localDay)||checkpoint.definitionsHash!==definitionsHash)return {...checkpoint,runId:row.run_id,status:'unavailable'};
 return {...checkpoint,runId:row.run_id};
}

export async function* streamCarryKeys(client:PoolClient,runId:string,visitorId:string){
 const staged=(await client.query("SELECT status IN('staging','ready') staged FROM analytics_fact_runs WHERE id=$1",[runId])).rows[0]?.staged;const relation=staged?'analytics_carry_keys':factReadRelations(client).carryKeysRelation??'analytics_carry_keys';
 const cursor=`carry_${randomUUID().replaceAll('-','')}`;await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT kind,key,state,first_ts,last_ts FROM ${relation} WHERE run_id=$1 AND visitor_id=$2 ORDER BY kind,key`,[runId,visitorId]);
 try{while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows;if(!rows.length)break;yield rows as {kind:CarryKey['kind'];key:string;state:CarryKey['state'];first_ts:Date;last_ts:Date}[];}}finally{await client.query(`CLOSE ${cursor}`);}
}
