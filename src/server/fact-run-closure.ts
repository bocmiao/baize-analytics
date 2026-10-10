import type {PoolClient} from 'pg';
/** One shared closed set, used both by migration proofs and source consumers.
 * Alias r is a published run, a its captured aggregation state. */
export const selectedFactRunPredicate=`r.status='published' AND r.epoch=a.epoch AND (EXISTS(SELECT 1 FROM analytics_carry_heads h WHERE h.site_id=$1 AND h.run_id=r.id AND h.epoch=a.epoch AND h.generation<=a.processed_generation) OR EXISTS(SELECT 1 FROM analytics_session_contribution_heads h WHERE h.site_id=$1 AND h.run_id=r.id AND h.epoch=a.epoch AND h.generation<=a.processed_generation) OR EXISTS(SELECT 1 FROM analytics_relational_buckets b WHERE b.site_id=$1 AND b.run_id=r.id) OR EXISTS(SELECT 1 FROM analytics_session_rebuild_requests q WHERE q.site_id=$1 AND q.run_id=r.id AND r.generation<=a.processed_generation) OR r.id=(SELECT id FROM analytics_fact_runs WHERE site_id=$1 AND query_version=2 AND status='published' ORDER BY generation DESC,created_at DESC LIMIT 1))`;


/** Legacy referenced owners must be explicitly journal-rebased, never silently
 * discarded merely because their V1 run still has an older epoch. */
export async function assertFactRunClosure(client:PoolClient,siteId:string,options:{forRebuild?:boolean}={}){
 const invalid=(await client.query(`WITH refs AS(SELECT run_id,epoch,generation FROM analytics_carry_heads WHERE site_id=$1 UNION ALL SELECT run_id,epoch,generation FROM analytics_session_contribution_heads WHERE site_id=$1 UNION ALL SELECT run_id,epoch,generation FROM analytics_relational_buckets WHERE site_id=$1 UNION ALL SELECT q.run_id,r.epoch,r.generation FROM analytics_session_rebuild_requests q LEFT JOIN analytics_fact_runs r ON r.id=q.run_id WHERE q.site_id=$1) SELECT 1 FROM refs x LEFT JOIN analytics_fact_runs r ON r.id=x.run_id JOIN aggregation_state a ON a.site_id=$1 WHERE r.id IS NULL OR r.site_id<>$1 OR r.status<>'published' OR r.epoch<>a.epoch OR x.epoch<>a.epoch OR x.generation>${options.forRebuild?'a.generation':'a.processed_generation'} LIMIT 1`,[siteId])).rowCount;
 if(invalid)throw Error('FACT_RUN_CLOSURE_UNAVAILABLE');
}
