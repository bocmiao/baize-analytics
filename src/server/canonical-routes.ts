import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {AppContext} from './context.js';
import {ApplicationError} from '../shared/error-codes.js';
import {transaction} from './db.js';
import {canonicalActions,canonicalStatus,runCanonicalOperation} from './canonical-operations.js';
export async function registerCanonicalOperations(app:FastifyInstance,ctx:AppContext){
 app.get('/api/v1/sites/:siteId/canonical',async req=>{
  const {siteId}=req.params as {siteId:string};await ctx.authorize(req,siteId,'admin');
  return transaction(ctx.pool,c=>canonicalStatus(c,siteId));
 });
 app.post('/api/v1/sites/:siteId/canonical',async req=>{
  const {siteId}=req.params as {siteId:string},user=await ctx.authorize(req,siteId,'admin');
  const {action}=z.object({action:z.enum(canonicalActions)}).strict().parse(req.body);
  try{return await transaction(ctx.pool,c=>runCanonicalOperation(c,ctx.pool,siteId,action,user.id));}
  catch(error){if(error instanceof Error&&error.message==='CANONICAL_INTEGRATION_NOT_READY')throw new ApplicationError('canonical_integration_not_ready');if(error instanceof Error&&(error.message==='CANONICAL_VALIDATION_STALE'||error.message==='CANONICAL_PRUNE_FENCE'))throw new ApplicationError('canonical_validation_stale');throw error;}
 });
}
