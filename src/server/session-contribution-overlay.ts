import {factReadRelations} from './fact-read-context.js';
import type {PoolClient} from 'pg';
import {basePublishedFactPredicate as publishedFactPredicate} from './fact-selection.js';

/** The old hour selection remains valid for sessions without an ownership head.
 * Owned sessions select one complete contribution run, including its expired prefix.
 * This predicate is not installed in production until the reducer publishes complete owners.
 */
export const sessionContributionPredicate=`((EXISTS(SELECT 1 FROM analytics_session_contribution_heads h JOIN aggregation_state a ON a.site_id=h.site_id JOIN analytics_fact_runs owner ON owner.id=h.run_id AND owner.site_id=h.site_id AND owner.status='published' WHERE h.site_id=$1 AND h.session_id=e.session_id AND h.run_id=e.run_id AND h.epoch=a.epoch AND h.generation<=a.processed_generation)) OR (NOT EXISTS(SELECT 1 FROM analytics_session_contribution_heads h WHERE h.site_id=$1 AND h.session_id=e.session_id) AND ${publishedFactPredicate}))`;

/** Vitals have no session_id: resolve the ownership through the matching event's
 * contribution rows. Never substitute a direct e.session_id predicate here.
 * Unowned legacy samples continue to use the old hour selection.
 */
export const sessionVitalContributionPredicate=`((EXISTS(SELECT 1 FROM analytics_effect_facts oe JOIN analytics_session_contribution_heads h ON h.site_id=$1 AND h.session_id=oe.session_id AND h.run_id=oe.run_id JOIN aggregation_state a ON a.site_id=h.site_id JOIN analytics_fact_runs owner ON owner.id=h.run_id AND owner.site_id=h.site_id AND owner.status='published' WHERE oe.run_id=e.run_id AND oe.event_id=e.event_id AND h.epoch=a.epoch AND h.generation<=a.processed_generation)) OR (NOT EXISTS(SELECT 1 FROM analytics_effect_facts oe JOIN analytics_session_contribution_heads h ON h.site_id=$1 AND h.session_id=oe.session_id WHERE oe.run_id=e.run_id AND oe.event_id=e.event_id) AND ${publishedFactPredicate}))`;

/** Both references matter: V1 prefix runs can own only checkpoints; published
 * contribution runs can own expired events outside every hourly pointer.
 */
export const carryRunReferenced=`(EXISTS(SELECT 1 FROM analytics_carry_heads h WHERE h.run_id=r.id) OR EXISTS(SELECT 1 FROM analytics_session_contribution_heads h WHERE h.run_id=r.id))`;

export const carryEffectReferenced=`EXISTS(SELECT 1 FROM analytics_session_contribution_heads h WHERE h.site_id=r.site_id AND h.run_id=e.run_id AND h.session_id=e.session_id)`;

export const carryVitalReferenced=`EXISTS(SELECT 1 FROM analytics_effect_facts oe JOIN analytics_session_contribution_heads h ON h.site_id=r.site_id AND h.run_id=oe.run_id AND h.session_id=oe.session_id WHERE oe.run_id=e.run_id AND oe.event_id=e.event_id)`;

/** Copy immutable pre-cutoff contributions using server-side SQL, with no event or member arrays.
 * Mutable session summaries and definition results must be re-emitted from exact prefix + tail state.
 */
export async function copySessionPrefixContributions(client:PoolClient,siteId:string,runId:string,sessionId:string,boundary:Date,expectedPageviews?:number){
 const run=(await client.query("SELECT r.site_id,r.status,r.epoch,a.epoch AS live_epoch FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id WHERE r.id=$1",[runId])).rows[0];
 if(!run||run.site_id!==siteId||run.epoch!==run.live_epoch||run.status!=='staging')throw Error('CARRY_CONTRIBUTION_STAGE_FENCE');
 const relations=factReadRelations(client);
 const selected=`e.session_id=$3 AND e.event_ts<$4 AND ${sessionContributionPredicate}`;
 const immutable=`e.metric NOT IN('sessions','bounces','duration_s','goal','segmentGoal','goalAttribution','funnel','funnelDefinition') AND NOT(e.metric='page' AND e.key->>1 IN('entries','exits','bounces')) AND NOT(e.metric='segment' AND e.key->>1='sessions')`;
 const params=[siteId,runId,sessionId,boundary];
 const effects=await client.query(`INSERT INTO analytics_effect_facts SELECT $2::uuid,e.event_id,e.event_ts,e.session_id,e.visitor_id,e.event_path,e.dimensions,e.metric,e.key,e.value,e.member FROM ${relations.effectsRelation} e WHERE ${selected} AND ${immutable} ON CONFLICT DO NOTHING`,params);
 if(expectedPageviews!==undefined){const n=Number((await client.query("SELECT COALESCE(sum(value),0) AS n FROM analytics_effect_facts WHERE run_id=$1 AND session_id=$2 AND metric='pv'",[runId,sessionId])).rows[0].n);if(n!==expectedPageviews)throw Error('CARRY_CONTRIBUTION_PREFIX_INCOMPLETE');}
 const vitals=await client.query(`INSERT INTO analytics_vital_samples SELECT $2::uuid,v.event_id,v.event_ts,v.event_path,v.dimensions,v.metric,v.value FROM ${relations.vitalsRelation} v WHERE v.event_ts<$4 AND EXISTS(SELECT 1 FROM ${relations.effectsRelation} e WHERE e.run_id=v.run_id AND e.event_id=v.event_id AND ${selected}) ON CONFLICT DO NOTHING`,params);
 await client.query(`INSERT INTO analytics_session_event_headers SELECT $2::uuid,h.event_id,h.session_id,h.visitor_id,h.event_ts,h.page_id,h.event_type,h.event_path,h.dimensions,h.reducer_payload,h.body_seal FROM analytics_session_event_headers h WHERE h.session_id=$3 AND h.event_ts<$4 AND EXISTS(SELECT 1 FROM ${relations.effectsRelation} e WHERE e.run_id=h.run_id AND e.event_id=h.event_id AND ${selected}) ON CONFLICT DO NOTHING`,params);
 return {effects:effects.rowCount??0,vitals:vitals.rowCount??0};
}

/** A missing or stale ownership backing is unavailable, never an empty exact result. */
export async function assertSessionContributionOwners(client:PoolClient,siteId:string){
 const invalid=(await client.query(`SELECT 1 FROM analytics_session_contribution_heads h LEFT JOIN aggregation_state a ON a.site_id=h.site_id LEFT JOIN analytics_fact_runs r ON r.id=h.run_id WHERE h.site_id=$1 AND (a.site_id IS NULL OR h.epoch<>a.epoch OR h.generation>a.processed_generation OR r.id IS NULL OR r.site_id<>h.site_id OR r.status<>'published') LIMIT 1`,[siteId])).rowCount;
 if(invalid)throw Error('CARRY_CONTRIBUTION_SOURCE_UNAVAILABLE');
}
