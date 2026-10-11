import {factReadRelations} from './fact-read-context.js';
import type {Pool,PoolClient} from 'pg';
import {factAuthorityMatches} from './fact-authority.js';
import {assertFactRunClosure} from './fact-run-closure.js';
import {withRemainingFactReadSource} from './remaining-fact-source.js';
/** A closed retained snapshot proves every accepted event in its retained
 * range, including empty buckets. It does not prove missing expired history.
 * Only a caller holding an authenticated original-cache scope may use this
 * evidence to reconstruct that scope; this function never clears flags. */
export async function assertCurrentFactRangeBacking(c:PoolClient,pool:Pool,site:string,from:string,to:string){
 const start=new Date(from),end=new Date(to);
 if(!Number.isFinite(+start)||!Number.isFinite(+end)||+start>=+end)throw Error('FACT_RANGE_BACKING_SCOPE');
 const head=(await c.query(`SELECT r.id,r.retained_from,r.generation::text,a.watermark FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id LEFT JOIN canonical_event_authority c ON c.site_id=r.site_id WHERE r.site_id=$1 AND r.status='published' AND r.query_version=2 AND r.epoch=a.epoch AND r.generation=a.processed_generation AND a.generation=a.processed_generation AND ${factAuthorityMatches} ORDER BY r.created_at DESC,r.id LIMIT 1`,[site])).rows[0];
 if(!head||!head.retained_from||+start<+new Date(head.retained_from)||(await c.query('SELECT 1 FROM analytics_session_rebuild_requests WHERE site_id=$1 LIMIT 1',[site])).rowCount)throw Error('FACT_RANGE_BACKING_UNAVAILABLE');
 await assertFactRunClosure(c,site);
 // Hydration verifies every selected committed body, producer seal and live
 // source fence. The same client is reused, even with a pool capacity of one.
 // This proof callback consumes no TEMP rows. Inherit only an authenticated
 // bound projection; unbound calls still authenticate the complete source.
 return withRemainingFactReadSource(c,pool,site,async()=>({covered:true as const,method:'complete_retained_accepted_snapshot' as const,runId:String(head.id),generation:String(head.generation),from:start.toISOString(),to:end.toISOString(),retainedFrom:new Date(head.retained_from).toISOString(),watermark:head.watermark??null}),{hydration:factReadRelations(c).hydration??'complete'});
}
