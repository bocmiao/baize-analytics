import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {HttpError} from '../server/security.js';
import {executorRequest} from './client.js';
import {runningUpdateIdentity,updateSocketPath} from './maintenance.js';
export function registerUpdates(app:FastifyInstance,options:{profile:'standard'|'lite';owner:(req:FastifyRequest)=>Promise<{id:string;claimedOwnerId:string|null}>}){
 const identity=runningUpdateIdentity();
 async function owner(req:FastifyRequest){const u=await options.owner(req);if(u.claimedOwnerId&&u.claimedOwnerId!==u.id)throw new HttpError(403,'update_instance_owner_required');return u;}
 app.get('/api/admin/updates/status',async req=>{
  const u=await owner(req);let remote:Record<string,unknown>|undefined,error:string|undefined;
  if(updateSocketPath()){try{remote=await executorRequest('status');if(remote?.ownerId!==u.id)throw new HttpError(403,'update_instance_owner_required');}catch(e){if(e instanceof HttpError)throw e;error=e instanceof Error&&/^UPDATE_[A-Z_]+$/.test(e.message)?e.message:'UPDATE_EXECUTOR_UNAVAILABLE';}}
  if(!u.claimedOwnerId&&!remote)throw new HttpError(403,'update_legacy_owner_binding_required');
  return {configured:!!remote,profile:options.profile,deploymentMode:remote?.deploymentMode??(process.env.BAIZE_DEPLOYMENT_MODE==='docker'?'docker-unmanaged':process.env.BAIZE_NATIVE_RUNTIME==='1'?'native-unmanaged':'source'),runningVersion:identity?.revision??process.env.BAIZE_BUILD_REVISION??null,runningManifestSha256:identity?.manifestSha256??null,reason:error??(!remote?'UPDATE_EXECUTOR_NOT_CONFIGURED':null),...remote};
 });
 for(const action of ['check','apply','rollback']as const)app.post('/api/admin/updates/'+action,async(req,reply)=>{
  const u=await owner(req);const body=z.object({operationId:z.uuid().optional(),expectedRevision:z.string().regex(/^[a-f0-9]{40}$/).optional(),expectedManifestSha256:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict().parse(req.body??{});if(action==='apply'&&(!body.expectedRevision||!body.expectedManifestSha256))throw new HttpError(400,'update_release_preview_required');if(action!=='check'&&!body.operationId)throw new HttpError(400,'update_operation_id_required');
  try{const status=await executorRequest('status');if(status.ownerId!==u.id)throw new HttpError(403,'update_instance_owner_required');const deferred=action!=='check'&&status.mechanism==='file-delta'&&status.responseAcknowledgement===true;const result=await executorRequest(action,u.id,body.operationId,{expectedRevision:body.expectedRevision,expectedManifestSha256:body.expectedManifestSha256,...deferred?{awaitResponse:true}:{}});reply.code(202);if(deferred&&result.awaitResponse===true)reply.raw.once('finish',()=>{void executorRequest('acknowledge',u.id,body.operationId).catch(()=>{/* Admission times out safely; status remains inspectable. */});});return result;}catch(e){if(e instanceof HttpError)throw e;const message=e instanceof Error&&/^UPDATE_[A-Z_]+$/.test(e.message)?e.message:'UPDATE_EXECUTOR_UNAVAILABLE';throw new HttpError(message==='UPDATE_BUSY'?409:503,message);}
 });
}
