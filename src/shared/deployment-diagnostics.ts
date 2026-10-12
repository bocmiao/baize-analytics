import {lstat,access} from 'node:fs/promises';
import {constants} from 'node:fs';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {createHash} from 'node:crypto';
import {z} from 'zod';

interface DiagnosticOptions {profile:'standard'|'lite';dataDir:string;keyDir:string;publicUrl:string;authorize:(request:FastifyRequest,installationNonce?:string)=>Promise<void>;storage:()=>Promise<{backend:'postgresql'|'sqlite';available:boolean;schemaVersion:number;sqliteVersion?:string}>}
async function privateDirectory(path:string){try{const stat=await lstat(path);await access(path,constants.R_OK|constants.W_OK);return {available:stat.isDirectory()&&!stat.isSymbolicLink(),private:(stat.mode&0o077)===0&&stat.uid===process.getuid?.()};}catch{return {available:false,private:false};}}
/** Credential- or administrator-guarded, closed whitelist: no paths or secrets. */
export function registerDeploymentDiagnostics(app:FastifyInstance,options:DiagnosticOptions){
 const limits=new Map<string,{count:number;until:number}>();
 app.post('/api/setup/diagnostics',async request=>{
  const key=createHash('sha256').update(request.ip).digest('hex'),now=Date.now();
  let entry=limits.get(key);if(!entry||entry.until<now){entry={count:0,until:now+60000};limits.set(key,entry);}if(++entry.count>10)throw Object.assign(Error('DIAGNOSTIC_RATE_LIMIT'),{statusCode:429});
  if(limits.size>1000){for(const [id,value]of limits)if(value.until<now)limits.delete(id);while(limits.size>1000)limits.delete(limits.keys().next().value!);}
  const body=z.object({installationNonce:z.string().length(64).regex(/^[a-f0-9]+$/).optional()}).strict().parse(request.body??{});
  await options.authorize(request,body.installationNonce);
  return {profile:options.profile,runtime:{nodeVersion:process.versions.node,platform:process.platform,architecture:process.arch},storage:await options.storage(),directories:{data:await privateDirectory(options.dataDir),keys:await privateDirectory(options.keyDir)},transport:{httpsConfigured:new URL(options.publicUrl).protocol==='https:',requestHttps:request.protocol==='https',certificateVerified:false},supervision:{managedByThisWebPage:false},limitations:['web_diagnostics_require_a_running_server','https_configuration_does_not_verify_certificate','service_supervision_is_operator_managed']};
 });
}
