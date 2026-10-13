import {spawn,execFile,type ChildProcess} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {existsSync,readFileSync,readdirSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {Pool} from 'pg';
import {parseEnv} from 'node:util';
import {checkEnvironmentFile,verifyRelease,preflight} from '../release/preflight.js';
import {guardSpace,type Pointer} from './state.js';
import type {AgentConfig,AgentRuntime} from './agent.js';

const sleep=(ms:number)=>new Promise<void>(done=>setTimeout(done,ms));
export class NativeRuntime implements AgentRuntime {
 private child?:ChildProcess;private launchId='';readonly env:NodeJS.ProcessEnv;readonly healthUrl:string;
 constructor(readonly config:AgentConfig,private assertActive:()=>void=()=>{}){
  if(process.getuid?.()===0)throw Error('UPDATE_NATIVE_EXECUTOR_MUST_BE_NONROOT');
  checkEnvironmentFile(config.envFile,config.initialRoot);
  this.env=parseEnv(readFileSync(config.envFile,'utf8'));
  if(this.env.DATA_DIR!==config.dataDir||this.env.KEYS_DIR!==config.keyDir||this.env.PUBLIC_URL!==config.publicUrl)throw Error('UPDATE_ENV_BINDING_MISMATCH');
  const port=Number(this.env.PORT??3000);if(!Number.isInteger(port)||port<1||port>65535)throw Error('UPDATE_LISTEN_PORT_INVALID');this.healthUrl='http://127.0.0.1:'+port;
  if(this.env.CLICKHOUSE_URL||this.env.HISTORY_STORE_ENABLED==='1')throw Error('UPDATE_NATIVE_CH_BACKUP_UNSUPPORTED');
  if(this.env.BAIZE_NATIVE_SINGLE_INSTANCE!=='1')throw Error('UPDATE_SINGLE_INSTANCE_ACK_REQUIRED');
 }
 private node(pointer:Pointer){return existsSync(join(pointer.root,'runtime/bin/node'))?join(pointer.root,'runtime/bin/node'):this.config.nodePath;}
 private environment(){return {...this.env,PATH:process.env.PATH,HOME:process.env.HOME,BAIZE_NATIVE_RUNTIME:'1',BAIZE_NATIVE_SINGLE_INSTANCE:'1',BAIZE_NATIVE_SOURCE_STOPPED:'1',BAIZE_ENV_FILE:this.config.envFile,BAIZE_UPDATE_SOCKET:join(this.config.agentDir,'executor.sock'),BAIZE_UPDATE_GATE:join(this.config.agentDir,'maintenance.json'),BAIZE_UPDATE_LAUNCH_ID:this.launchId,HOST:this.env.HOST??'127.0.0.1',PORT:this.env.PORT??'3000',GEOIP_AUTO_DOWNLOAD:'0'};}
 setActiveGuard(guard:()=>void){this.assertActive=guard;}
 async start(pointer:Pointer){this.assertActive();
  if(this.child&&this.child.exitCode===null&&this.child.signalCode===null)throw Error('UPDATE_PROCESS_ALREADY_RUNNING');
  const m=verifyRelease(pointer.root);preflight(pointer.root,{...this.env,BAIZE_ENV_FILE:this.config.envFile});this.launchId=randomUUID();
  await new Promise<void>((done,reject)=>execFile(this.node(pointer),['-e','if(Number(process.versions.node.split(".")[0])!==24)process.exit(42)'],{cwd:pointer.root,env:{PATH:process.env.PATH},timeout:5000,maxBuffer:65536},error=>error?reject(Error('UPDATE_NODE_MAJOR_UNSUPPORTED')):done()));
  this.assertActive();this.child=spawn(this.node(pointer),[join(pointer.root,'dist/server/src',m.profile==='lite'?'lite':'server','main.js')],{cwd:pointer.root,env:this.environment(),stdio:['ignore','ignore','ignore']});
  await new Promise<void>((done,reject)=>{this.child!.once('spawn',done);this.child!.once('error',()=>reject(Error('UPDATE_PROCESS_START_FAILED')));});
 }
 async stop(){
  const child=this.child;if(!child||child.exitCode!==null||child.signalCode!==null){this.child=undefined;return;}
  await new Promise<void>((done,reject)=>{const timer=setTimeout(()=>{child.kill('SIGKILL');},30000);child.once('close',()=>{clearTimeout(timer);if(child.signalCode==='SIGKILL')reject(Error('UPDATE_PROCESS_DRAIN_FAILED'));else done();});child.kill('SIGTERM');});this.child=undefined;
 }
 async healthy(pointer:Pointer){
  for(let attempt=0;attempt<120;attempt++){this.assertActive();
   if(!this.child||this.child.exitCode!==null||this.child.signalCode!==null)throw Error('UPDATE_PROCESS_EXITED');
   try{const response=await fetch(new URL('/healthz',this.healthUrl),{signal:AbortSignal.timeout(1000)});const b=await response.json()as{ok?:boolean;database?:string;updateIdentity?:{revision?:string;manifestSha256?:string;launchId?:string}};
    this.assertActive();if(response.ok&&b.ok&&b.database==='ready'&&b.updateIdentity?.revision===pointer.revision&&b.updateIdentity.manifestSha256===pointer.manifestSha256&&b.updateIdentity.launchId===this.launchId){const html=await fetch(this.healthUrl,{signal:AbortSignal.timeout(3000)});if(html.ok&&(await html.text()).includes('id="root"'))return;}
   }catch{/* bounded health polling; no credentials/errors are returned */}
   await sleep(250);
  }throw Error('UPDATE_HEALTH_IDENTITY_FAILED');
 }
 async backupEstimate(pointer:Pointer){
  const m=verifyRelease(pointer.root);let total=0;const walk=(root:string)=>{for(const name of readdirSync(root)){const path=join(root,name),s=lstatSync(path);if(s.isSymbolicLink())throw Error('UPDATE_DATA_SYMLINK_UNSUPPORTED');if(s.isDirectory())walk(path);else total+=s.size;}};walk(this.config.dataDir);walk(this.config.keyDir);
  if(m.profile==='standard'){const pool=new Pool({connectionString:this.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000});try{total+=Number((await pool.query('SELECT pg_database_size(current_database()) bytes')).rows[0].bytes);}finally{await pool.end();}}
  return total*2+32*1024*1024;
 }
 async backup(pointer:Pointer,destination:string){this.assertActive();
  const m=verifyRelease(pointer.root);const args=m.profile==='lite'?[join(pointer.root,'dist/server/scripts/lite-ops.js'),'backup',destination]:[join(pointer.root,'dist/server/src/release/standard-ops.js'),'backup',destination];
  await new Promise<void>((done,reject)=>{const child=spawn(this.node(pointer),args,{cwd:pointer.root,env:this.environment(),detached:true,stdio:['ignore','ignore','ignore']});const killJob=(signal:NodeJS.Signals)=>{if(!child.pid)return;try{process.kill(-child.pid,signal);}catch{/* Already exited group */}};let failure:string|undefined;const timer=setTimeout(()=>{failure='UPDATE_BACKUP_TIMEOUT';killJob('SIGTERM');},120000);const monitor=setInterval(()=>{try{this.assertActive();guardSpace(this.config.agentDir);guardSpace(this.config.dataDir);}catch{failure='UPDATE_SPACE_PROTECTION';killJob('SIGTERM');}},250);const hardStop=setTimeout(()=>killJob('SIGKILL'),150000);child.once('error',()=>{failure='UPDATE_BACKUP_START_FAILED';});child.once('close',()=>{clearTimeout(timer);clearTimeout(hardStop);clearInterval(monitor);if(failure||child.exitCode!==0)reject(Error(failure??'UPDATE_BACKUP_FAILED'));else done();});});
  if(!existsSync(join(destination,'manifest.json')))throw Error('UPDATE_BACKUP_COMPLETION_MISSING');
 }
}
