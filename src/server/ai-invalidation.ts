import type {PoolClient} from 'pg';
/** Conservative site-wide derived-data purge. Caller must already hold the site/partition gate.
 * Quota ledgers and encrypted connector configuration are intentionally retained.
 * DELETE is compatible with immutable evidence triggers; old evidence is never rewritten.
 */
export async function invalidateSiteAi(client:PoolClient,siteId:string){
 const notifications=await client.query("UPDATE notification_jobs SET body=jsonb_build_object('invalidated',true,'reason','site-derived-privacy-invalidation'),status='revoked',lease_until=NULL,last_error=NULL WHERE site_id=$1 AND (body->>'kind' IN('traffic','goal','funnel') OR dedupe_key LIKE 'report:%')",[siteId]);
 const suggestions=await client.query('DELETE FROM ai_suggestions WHERE site_id=$1',[siteId]);
 // Final question traces cascade via call FK; other immutable initial snapshots and prose are erased.
 const calls=await client.query('DELETE FROM ai_calls WHERE site_id=$1',[siteId]);
 return {notifications:notifications.rowCount??0,calls:calls.rowCount??0,suggestions:suggestions.rowCount??0,policy:'conservative-site-derived-purge',quotaRetained:true};
}
