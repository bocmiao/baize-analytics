import type {PoolClient} from 'pg';
/** Conservative site-wide derived-data purge. Caller must already hold the site/partition gate.
 * Quota ledgers and encrypted connector configuration are intentionally retained.
 * DELETE is compatible with immutable evidence triggers; old evidence is never rewritten.
 */
export async function invalidateSiteAi(client:PoolClient,siteId:string){
 const suggestions=await client.query('DELETE FROM ai_suggestions WHERE site_id=$1',[siteId]);
 // Final question traces cascade via call FK; other immutable initial snapshots and prose are erased.
 const calls=await client.query('DELETE FROM ai_calls WHERE site_id=$1',[siteId]);
 return {calls:calls.rowCount??0,suggestions:suggestions.rowCount??0,policy:'conservative-site-derived-purge',quotaRetained:true};
}
