import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {selectedFactRunPredicate} from './fact-run-closure.js';

/** One closure computation only. The caller must use a REPEATABLE READ or
 * SERIALIZABLE snapshot, or hold the same-site gate across the entire closure
 * computation so concurrent selected-owner/receipt mutations are excluded.
 * An arbitrary unlocked READ COMMITTED transaction does not guarantee that
 * materializing once is equivalent to selecting again in each statement.
 * Never reuse across mutations, capture/advance, clients, transactions or
 * requests, and never cache this selection. Source/body authentication stays
 * with the original callers; this contains only the identical run IDs. */
export async function withCoverageSelectedRuns<T>(client:PoolClient,site:string,fn:(relation:string)=>Promise<T>):Promise<T>{
 const relation='coverage_selected_'+randomUUID().replaceAll('-','');
 const predicate=selectedFactRunPredicate.replaceAll('a.processed_generation','a.generation');
 await client.query(`CREATE TEMP TABLE ${relation}(id uuid PRIMARY KEY) ON COMMIT DROP`);
 let failed=false;
 try{
  await client.query(`INSERT INTO ${relation}(id) SELECT r.id FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id WHERE r.site_id=$1 AND ${predicate}`,[site]);
  return await fn(relation);
 }catch(error){failed=true;throw error;}finally{
  try{await client.query(`DROP TABLE ${relation}`);}catch(error){if(!failed)throw error;}
 }
}
