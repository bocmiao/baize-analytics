import {basePublishedFactPredicate} from './fact-selection.js';
export type FactHydration='complete'|'selected';
export interface FactHydrationOptions{hydration?:FactHydration;forRebuild?:boolean;forAuthorityTransition?:boolean;cutoverRepair?:unknown}
/** Repair/producer/authority paths need original, superseded rows as evidence. */
export function requestedFactHydration(options:FactHydrationOptions={}):FactHydration{
 return options.forRebuild||options.forAuthorityTransition||options.cutoverRepair?'complete':options.hydration??'complete';
}
export function assertFactHydrationReuse(existing:FactHydration|undefined,options:FactHydrationOptions={}){
 if(existing==='selected'&&requestedFactHydration(options)==='complete')throw Error('FACT_SOURCE_PROJECTION_INCOMPATIBLE');
}
/** Only applied AFTER the original complete batch's receipt/count/hash and
 * producer HMAC have been authenticated. r is the original body, envelope's
 * sessionId is authenticated transport provenance (vitals have no body session).
 * Empty retired heads are authoritative: they suppress older contributions.
 * No ownership head retains precisely the existing legacy hourly selection. */
export const selectedFactHydrationPredicate=`(
 EXISTS(SELECT 1 FROM analytics_session_contribution_heads h
 JOIN aggregation_state a ON a.site_id=h.site_id
 JOIN analytics_fact_runs owner ON owner.id=h.run_id AND owner.site_id=h.site_id AND owner.status='published'
 WHERE h.site_id=$1 AND h.session_id=envelope."sessionId"::uuid
 AND h.run_id=r.run_id AND h.epoch=a.epoch AND h.generation<=a.processed_generation)
 OR(NOT EXISTS(SELECT 1 FROM analytics_session_contribution_heads h
 WHERE h.site_id=$1 AND h.session_id=envelope."sessionId"::uuid)
 AND ${basePublishedFactPredicate.replaceAll('e.','r.')})
)`;
