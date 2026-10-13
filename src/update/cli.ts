import {operationFingerprint} from './protocol.js';
import {createServer} from 'node:http';
import {existsSync,lstatSync,unlinkSync,chmodSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {z} from 'zod';
import {UpdateAgent,agentConfigSchema} from './agent.js';
import {NativeRuntime} from './runtime.js';
import {trustedJSON} from './state.js';

export async function runExecutor(configPath:string){
 if(configPath!==resolve(configPath))throw Error('UPDATE_CONFIG_ABSOLUTE_PATH_REQUIRED');const stat=lstatSync(configPath);if((stat.mode&0o777)!==0o600)throw Error('UPDATE_CONFIG_MUST_BE_PRIVATE');
 const config=agentConfigSchema.parse(trustedJSON(configPath)),agent=new UpdateAgent(config,new NativeRuntime(config));await agent.open();
 const socket=join(config.agentDir,'executor.sock');if(existsSync(socket)){if(!lstatSync(socket).isSocket())throw Error('UPDATE_SOCKET_PATH_OCCUPIED');unlinkSync(socket);}
 const command=z.object({action:z.enum(['check','apply','rollback']),actorId:z.uuid(),operationId:z.uuid().optional(),expectedRevision:z.string().regex(/^[a-f0-9]{40}$/).optional(),expectedManifestSha256:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict();
 const server=createServer(async(req,res)=>{const send=(status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  try{if(req.method==='GET'&&req.url==='/status'){send(200,agent.status());return;}if(req.method!=='POST'||req.url!=='/commands'){send(404,{error:'UPDATE_OPERATION_NOT_ALLOWED'});return;}let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>4096)throw Error('UPDATE_REQUEST_TOO_LARGE');chunks.push(chunk);}const c=command.parse(JSON.parse(Buffer.concat(chunks).toString()));if(c.actorId!==config.ownerId)throw Error('UPDATE_INSTANCE_OWNER_REQUIRED');if(c.action!=='check'&&!c.operationId)throw Error('UPDATE_OPERATION_ID_REQUIRED');
   if(c.action!=='check'&&c.operationId){const cached=agent.admit(c.actorId,c.operationId,c.action,c.expectedRevision&&c.expectedManifestSha256?{revision:c.expectedRevision,manifestSha256:c.expectedManifestSha256}:undefined);if(cached){send(202,{accepted:true,cached:true,operationId:c.operationId,phase:cached.phase,error:cached.error,current:agent.status().current});return;}}
   if(c.operationId&&agent.store.state.operationId===c.operationId&&['preflight','downloading','staged','maintenance','backup','switching','health','rolling_back'].includes(agent.store.state.phase)){const expected=c.expectedRevision&&c.expectedManifestSha256?{revision:c.expectedRevision,manifestSha256:c.expectedManifestSha256}:undefined;if(c.action==='check'||agent.store.state.requestFingerprint!==operationFingerprint(c.action,expected))throw Error('UPDATE_IDEMPOTENCY_MISMATCH');send(202,{accepted:true,...agent.status()});return;}
   if(['preflight','downloading','staged','maintenance','backup','switching','health','rolling_back','checking'].includes(agent.store.state.phase))throw Error('UPDATE_BUSY');
   const job=c.action==='check'?agent.check(c.actorId):c.action==='apply'?agent.apply(c.actorId,c.operationId!,c.expectedRevision&&c.expectedManifestSha256?{revision:c.expectedRevision,manifestSha256:c.expectedManifestSha256}:undefined):agent.rollback(c.actorId,c.operationId!);void job.catch(()=>{/* Persistent state records sanitized errors; web polls status. */});send(202,{accepted:true,operationId:c.operationId??null,...agent.status()});
  }catch(error){const message=error instanceof Error&&/^UPDATE_[A-Z_]+$/.test(error.message)?error.message:'UPDATE_REQUEST_INVALID';send(message==='UPDATE_BUSY'?409:400,{error:message});}
 });
 await new Promise<void>((done,reject)=>{server.once('error',reject);server.listen(socket,done);});chmodSync(socket,0o600);let closing=false;
 for(const signal of ['SIGTERM','SIGINT']as const)process.on(signal,()=>{if(closing)return;closing=true;server.close(()=>{void agent.close().then(()=>process.exit(0),()=>process.exit(1));});});
 return {server,agent};
}
if(process.argv[2]==='--config'&&process.argv.length===4)await runExecutor(process.argv[3]!);
