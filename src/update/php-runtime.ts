import {spawn,type ChildProcess} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,readdirSync,lstatSync,unlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {digest,safeReleasePath} from './protocol.js';
import {parseEnv} from 'node:util';
import {checkEnvironmentFile,safeAncestors,assertDisjoint} from '../release/preflight.js';
import {verifyUpdateRelease} from './release.js';
import {durableJSON,trustedJSON,privateDirectory,guardSpace,syncDirectory,type Pointer} from './state.js';
import type {AgentConfig,AgentRuntime} from './agent.js';

const sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
// This fixed independent watchdog survives an executor crash. Closing the parent's
// pipe fences the instance and drains every child group before allowing recovery.
const watchdog=String.raw`
const fs=require('node:fs'),cp=require('node:child_process');
const spec=JSON.parse(process.argv[1]);let stopping=false,failed=false;
const children=spec.commands.map(command=>{const p=cp.spawn(command[0],command.slice(1),{env:spec.env,cwd:spec.cwd,detached:true,stdio:['ignore','ignore','inherit']});p.once('error',()=>{failed=true;stop();});p.once('exit',code=>{if(!stopping){if(spec.once&&code===0){stopping=true;}else{failed=true;stop();}}});return p;});
function stop(){if(stopping)return;stopping=true;try{const f=fs.openSync(spec.gate+'.watchdog','w',0o600);fs.writeFileSync(f,JSON.stringify({version:1,maintenance:true,operationId:'executor-disconnected'}));fs.fsyncSync(f);fs.closeSync(f);fs.renameSync(spec.gate+'.watchdog',spec.gate);const d=fs.openSync(require('node:path').dirname(spec.gate),'r');fs.fsyncSync(d);fs.closeSync(d);}catch{failed=true;}
for(let i=0;i<children.length;i++){const p=children[i];if(p.pid&&p.exitCode===null&&p.signalCode===null)try{process.kill(-p.pid,spec.signals[i]);}catch{}}
const timer=setTimeout(()=>{failed=true;for(const p of children)if(p.pid)try{process.kill(-p.pid,'SIGKILL');}catch{}},40000);timer.unref();}
process.stdin.resume();process.stdin.on('end',stop);process.stdin.on('data',stop);process.on('SIGTERM',stop);process.on('SIGINT',stop);
setInterval(()=>{if(stopping&&children.every(p=>p.exitCode!==null||p.signalCode!==null))process.exit(failed?1:0);},50);
`;

export class PhpRuntime implements AgentRuntime {
 private child?:ChildProcess;private launchId='';private assertActive=()=>{};readonly env:NodeJS.ProcessEnv;readonly healthUrl:string;private port:number;private directory:string;
 constructor(readonly config:AgentConfig){
  if(process.getuid?.()===0)throw Error('UPDATE_NATIVE_EXECUTOR_MUST_BE_NONROOT');if(!config.php)throw Error('UPDATE_PHP_CONFIG_REQUIRED');
  checkEnvironmentFile(config.envFile,config.initialRoot);this.env=parseEnv(readFileSync(config.envFile,'utf8'));
  if(this.env.DATA_DIR!==config.dataDir||this.env.KEYS_DIR!==config.keyDir||this.env.PUBLIC_URL!==config.publicUrl||this.env.BAIZE_CONFIG_PATH!==config.php.configPath||this.env.BAIZE_PHP_SINGLE_INSTANCE!=='1')throw Error('UPDATE_PHP_ENV_BINDING_MISMATCH');
  for(const p of Object.values(config.php)){if(p!==resolve(p)||!/^[A-Za-z0-9_./-]+$/.test(p))throw Error('UPDATE_PHP_PATH_INVALID');safeAncestors(p);}checkEnvironmentFile(config.php.configPath,config.initialRoot);
  assertDisjoint([config.php.configPath,config.agentDir,config.releasesDir,config.dataDir,config.keyDir]);
  this.port=Number(this.env.PORT??3000);if(!Number.isInteger(this.port)||this.port<1024||this.port>65535||!['127.0.0.1','0.0.0.0'].includes(this.env.HOST??'127.0.0.1'))throw Error('UPDATE_LISTEN_PORT_INVALID');
  if(!/^[A-Za-z0-9_./-]+$/.test(config.agentDir+config.releasesDir))throw Error('UPDATE_PHP_PATH_INVALID');this.healthUrl='http://127.0.0.1:'+this.port;this.directory=join(config.agentDir,'php-runtime');privateDirectory(this.directory);
 }
 setActiveGuard(guard:()=>void){this.assertActive=guard;}
 private environment():NodeJS.ProcessEnv{return {...this.env,PATH:process.env.PATH,BAIZE_UPDATE_DATA_DIR:this.config.dataDir,BAIZE_UPDATE_KEY_DIR:this.config.keyDir,BAIZE_UPDATE_PUBLIC_URL:this.config.publicUrl,BAIZE_UPDATE_SOCKET:join(this.config.agentDir,'executor.sock'),BAIZE_UPDATE_GATE:join(this.config.agentDir,'maintenance.json'),BAIZE_UPDATE_LAUNCH_ID:this.launchId};}
 private async run(pointer:Pointer,commands:string[][],signals:string[],once=false){
  this.assertActive();const record=join(this.directory,'watchdog.json');if(existsSync(record)){const old=trustedJSON<{pid:number;identity:string}>(record);for(let i=0;i<100;i++){let same=false;try{same=readFileSync('/proc/'+old.pid+'/stat','utf8').split(' ')[21]===old.identity;}catch{}if(!same)break;if(i===99)throw Error('UPDATE_PHP_PREVIOUS_SERVICE_RUNNING');await sleep(100);}}
  const child=spawn(this.config.nodePath,['-e',watchdog,JSON.stringify({commands,signals,once,env:this.environment(),cwd:pointer.root,gate:join(this.config.agentDir,'maintenance.json')})],{stdio:['pipe','ignore','ignore']});this.child=child;
  await new Promise<void>((done,reject)=>{child.once('spawn',done);child.once('error',()=>reject(Error('UPDATE_PROCESS_START_FAILED')));});
  durableJSON(record,{pid:child.pid,identity:readFileSync('/proc/'+child.pid+'/stat','utf8').split(' ')[21]});return child;
 }
 private async operation(pointer:Pointer,action:'preflight'|'backup',destination:string){
  const child=await this.run(pointer,[[this.config.php!.phpPath,join(pointer.root,'bin/update-ops.php'),action,destination]],['SIGTERM'],true);
  // A one-shot job ends normally; watchdog notices exit and closes only its own group.
  await new Promise<void>((done,reject)=>{let failure:string|undefined;const timer=setTimeout(()=>{failure='UPDATE_BACKUP_TIMEOUT';child.stdin!.end();},120000);const monitor=setInterval(()=>{try{this.assertActive();guardSpace(this.config.agentDir);}catch{failure='UPDATE_SPACE_OR_OWNERSHIP_LOST';child.stdin!.end();}},250);child.once('close',()=>{clearTimeout(timer);clearInterval(monitor);this.child=undefined;try{if(failure)throw Error(failure);if(child.exitCode!==0)throw Error('UPDATE_PHP_OPERATION_FAILED');if(action==='backup'&&!existsSync(join(destination,'manifest.json')))throw Error('UPDATE_BACKUP_COMPLETION_MISSING');if(action==='preflight'&&child.exitCode!==0)throw Error('UPDATE_PHP_PREFLIGHT_FAILED');done();}catch(e){reject(e);}});});
 }
 async start(pointer:Pointer){
  this.assertActive();if(this.child&&this.child.exitCode===null&&this.child.signalCode===null)throw Error('UPDATE_PROCESS_ALREADY_RUNNING');
  if(verifyUpdateRelease(pointer.root).variant!=='php-fpm')throw Error('UPDATE_PHP_RELEASE_REQUIRED');this.launchId=randomUUID();
  // Preflight is performed with the same private PHP configuration, never migrations.
  await this.operation(pointer,'preflight',this.directory);this.assertActive();
  const socket=join(this.directory,'fpm.sock');if(existsSync(socket)){if(!lstatSync(socket).isSocket())throw Error('UPDATE_PHP_SOCKET_OCCUPIED');unlinkSync(socket);}
  const fpm=join(this.directory,'fpm.conf'),nginx=join(this.directory,'nginx.conf'),env=this.environment();
  const fields=['BAIZE_CONFIG_PATH','BAIZE_UPDATE_DATA_DIR','BAIZE_UPDATE_KEY_DIR','BAIZE_UPDATE_PUBLIC_URL','BAIZE_UPDATE_SOCKET','BAIZE_UPDATE_GATE','BAIZE_UPDATE_LAUNCH_ID'];
  if(fields.some(k=>/[\r\n"\\]/.test(env[k]??'')))throw Error('UPDATE_PHP_ENV_INVALID');
  writeFileSync(fpm,`[global]\nerror_log = ${this.directory}/fpm.log\ndaemonize = no\n[baize]\nlisten = ${socket}\nlisten.mode = 0600\npm = static\npm.max_children = 2\nclear_env = yes\ncatch_workers_output = yes\n`+fields.map(k=>`env[${k}] = "${env[k]}"\n`).join(''),{mode:0o600});
  const root=pointer.root+'/public';if(!/^[A-Za-z0-9_./-]+$/.test(root))throw Error('UPDATE_PHP_PATH_INVALID');
  writeFileSync(nginx,`pid ${this.directory}/nginx.pid;\nerror_log ${this.directory}/nginx.log;\nworker_processes 1;\nevents { worker_connections 128; }\nhttp { types { application/javascript js; text/css css; text/html html; font/woff2 woff2; image/png png; image/svg+xml svg; application/json json; } access_log off; client_body_temp_path ${this.directory}/body; fastcgi_temp_path ${this.directory}/fastcgi; proxy_temp_path ${this.directory}/proxy; uwsgi_temp_path ${this.directory}/uwsgi; scgi_temp_path ${this.directory}/scgi; client_max_body_size 32m; server { listen ${this.env.HOST??'127.0.0.1'}:${this.port}; root ${root}; index index.php; location / { try_files $uri $uri/ /index.php?$query_string; } location ~ \\.php$ { try_files $uri =404; fastcgi_pass unix:${socket}; fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name; fastcgi_param REQUEST_METHOD $request_method; fastcgi_param REQUEST_URI $request_uri; fastcgi_param QUERY_STRING $query_string; fastcgi_param CONTENT_TYPE $content_type; fastcgi_param CONTENT_LENGTH $content_length; fastcgi_param SERVER_PROTOCOL $server_protocol; fastcgi_param SERVER_NAME $host; fastcgi_param SERVER_PORT $server_port; fastcgi_param REMOTE_ADDR $remote_addr; fastcgi_param HTTP_PROXY ""; } } }\n`,{mode:0o600});
  await this.run(pointer,[[this.config.php!.fpmPath,'-F','-y',fpm],[this.config.php!.nginxPath,'-e',join(this.directory,'nginx.log'),'-p',this.directory,'-c',nginx,'-g','daemon off;'],[this.config.php!.phpPath,join(pointer.root,'bin/worker.php'),'--loop']],['SIGQUIT','SIGQUIT','SIGTERM']);
 }
 async stop(){const child=this.child;if(!child||child.exitCode!==null||child.signalCode!==null){this.child=undefined;return;}await new Promise<void>((done,reject)=>{child.once('close',()=>{this.child=undefined;if(child.exitCode===0)done();else reject(Error('UPDATE_PROCESS_DRAIN_FAILED'));});child.stdin!.end();});}
 async healthy(pointer:Pointer){for(let i=0;i<120;i++){this.assertActive();if(!this.child||this.child.exitCode!==null||this.child.signalCode!==null)throw Error('UPDATE_PROCESS_EXITED');try{const r=await fetch(this.healthUrl+'/healthz',{signal:AbortSignal.timeout(1000)}),b=await r.json() as any;if(r.ok&&b.ok&&b.database==='ready'&&b.updateIdentity?.revision===pointer.revision&&b.updateIdentity?.manifestSha256===pointer.manifestSha256&&b.updateIdentity?.launchId===this.launchId){const html=await fetch(this.healthUrl,{signal:AbortSignal.timeout(1000)});if(html.ok&&(await html.text()).includes('id="root"'))return;}}catch{}await sleep(250);}throw Error('UPDATE_HEALTH_IDENTITY_FAILED');}
 async backupEstimate(){let bytes=64*1024*1024;const walk=(root:string)=>{for(const name of readdirSync(root)){const p=join(root,name),s=lstatSync(p);if(s.isSymbolicLink())throw Error('UPDATE_DATA_SYMLINK_UNSUPPORTED');if(s.isDirectory())walk(p);else bytes+=s.size;}};walk(this.config.dataDir);walk(this.config.keyDir);return bytes*3;}
 async backup(pointer:Pointer,destination:string){this.assertActive();guardSpace(this.config.agentDir);await this.operation(pointer,'backup',destination);const m=trustedJSON<{files:{path:string;bytes:number;sha256:string}[]}>(join(destination,'manifest.json'));for(const e of m.files){if(!safeReleasePath(e.path)&&!e.path.startsWith('data/')&&!e.path.startsWith('keys/'))throw Error('UPDATE_BACKUP_INCOMPLETE');const p=join(destination,e.path);safeAncestors(p);const s=lstatSync(p);if(!s.isFile()||s.nlink!==1||s.size!==e.bytes||digest(readFileSync(p))!==e.sha256)throw Error('UPDATE_BACKUP_INCOMPLETE');}const sync=(p:string)=>{for(const name of readdirSync(p)){const sub=join(p,name);if(lstatSync(sub).isDirectory())sync(sub);}syncDirectory(p);};sync(destination);if(!m.files.some(e=>e.path==='database.json')||!m.files.some(e=>e.path==='config.php')||!m.files.some(e=>e.path.startsWith('keys/')))throw Error('UPDATE_BACKUP_INCOMPLETE');}
}
