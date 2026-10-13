import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,cpSync,statfsSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createServer} from 'node:http';
import {generateKeyPairSync,randomUUID,randomBytes} from 'node:crypto';
import {DockerAgent} from '../../src/update/docker-agent.js';
import {digest} from '../../src/update/protocol.js';
import type {DockerConfig} from '../../src/update/docker-runtime.js';
const root=resolve(process.env.BAIZE_DOCKER_ACCEPT_ROOT??'/workspace/baize-transfer/docker-accept');mkdirSync(root,{recursive:true,mode:0o700});
process.env.DOCKER_CONFIG='/workspace/baize-transfer/docker-cli';
const docker=(...args:string[])=>execFileSync('/usr/local/bin/docker',args,{encoding:'utf8',maxBuffer:8*1024*1024});
const schema=digest(Buffer.concat(readdirSync('db/migrations').sort().flatMap(n=>[Buffer.from(n),readFileSync(join('db/migrations',n))])));
const results=[];
async function req(url:string,path:string,body?:unknown,cookie?:string){const r=await fetch(url+path,{method:body===undefined?'GET':'POST',headers:{...body===undefined?{}:{'Content-Type':'application/json'},...cookie?{cookie}:{}},...body===undefined?{}:{body:JSON.stringify(body)}});return {status:r.status,json:await r.json()as any,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
for(const profile of (process.env.BAIZE_ACCEPT_PROFILES?.split(',')??['standard','lite'])as ('standard'|'lite')[]){
 const r=join(root,profile);mkdirSync(r,{mode:0o700});const baseRevision=process.env.BAIZE_ACCEPT_BASE_REVISION;if(!baseRevision||!(/^[a-f0-9]{40}$/).test(baseRevision))throw Error('Explicit frozen delivery source revision required');const baseTag=`baize-delivery-${profile}:${baseRevision.slice(0,7)}`,base=JSON.parse(docker('image','inspect',baseTag))[0];if(base.Config.Labels?.['org.opencontainers.image.revision']!==baseRevision||base.Config.Labels?.['io.baize.profile']!==profile)throw Error('Frozen profile image mismatch');const context=join(root,'fixture-image-context');mkdirSync(context,{recursive:true,mode:0o700});const ids:string[]=[];const revs=['a'.repeat(40),'b'.repeat(40)];
 for(const [i,revision]of revs.entries()){
  const fs=statfsSync(root);if(fs.bavail*fs.bsize<3*1073741824+2*1073741824)throw Error('acceptance space protection');
  writeFileSync(join(context,'marker'),`window.__baizeFixture="${i?'B':'A'}";`,{mode:0o644});
  writeFileSync(join(context,'Dockerfile.profile'),`FROM ${baseTag}\nLABEL io.baize.profile="${profile}" io.baize.release-id="${revision}" io.baize.schema-fingerprint="${schema}"\nCOPY --chown=node:node marker /app/dist/web/assets/update-fixture.js\nCMD ["node","dist/server/src/${profile==='lite'?'lite':'server'}/main.js"]\n`);
  docker('build','--pull=false','--network','none','-f',join(context,'Dockerfile.profile'),'-t',`baize-update-accept-${profile}-${i}`,context);ids.push(docker('image','inspect',`baize-update-accept-${profile}-${i}`,'--format','{{.Id}}').trim());
 }
 const kp=generateKeyPairSync('ed25519'),privatePath=join(r,'fixture-signing-key.pem');writeFileSync(privatePath,kp.privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600});
 const publication=join(r,'publication');execFileSync('python3',['scripts/publish-image-update.py','--base-image',ids[0]!,'--target-image',ids[1]!,'--output',publication,'--key-file',privatePath,'--key-id','LOCAL-ACCEPTANCE','--label','本地真实应用 Docker 增量验收'],{stdio:'inherit'});
 const signed=JSON.parse(readFileSync(join(publication,'latest.json'),'utf8')),delta=JSON.parse(signed.body),requests:{path:string;bytes:number}[]=[];
 const source=createServer((req,res)=>{const path=req.url??'';if(path!=='/latest.json'&&!/^\/blobs\/[a-f0-9]{64}$/.test(path)){res.writeHead(404).end();return;}try{const b=readFileSync(join(publication,path));requests.push({path,bytes:b.length});res.writeHead(200,{'Content-Length':b.length}).end(b);}catch{res.writeHead(404).end();}});await new Promise<void>(done=>source.listen(0,'127.0.0.1',done));
 const project=`baize-upd-accept-${profile}-${digest(root).slice(0,6)}`,port=profile==='standard'?33081:33082,url=`http://127.0.0.1:${port}`;
 const ops=join(r,'ops');mkdirSync(join(ops,'scripts'),{recursive:true,mode:0o700});mkdirSync(join(ops,'.baize'),{mode:0o700});writeFileSync(join(ops,'.baize/master.key'),randomBytes(32),{mode:0o600});const env=join(ops,'.env');writeFileSync(env,'POSTGRES_PASSWORD=IsolatedAcceptanceOnly\n',{mode:0o600});
 const support=['scripts/backup.sh','scripts/ops-preflight.sh','scripts/ops-validate-journal.mjs'];for(const name of support)cpSync(name,join(ops,name));
 const compose=join(r,'compose.json');writeFileSync(compose,JSON.stringify({services:{app:{image:ids[0],ports:[`127.0.0.1:${port}:3000`],environment:{PUBLIC_URL:url,GEOIP_AUTO_DOWNLOAD:'0',...profile==='standard'?{DATABASE_URL:'postgres://baize:IsolatedAcceptanceOnly@postgres:5432/baize',MASTER_KEY_FILE:'/run/secrets/master_key'}:{}},volumes:['data:/app/data','keys:/app/keys'],...profile==='standard'?{secrets:['master_key'],depends_on:{postgres:{condition:'service_healthy'}}}:{}},...profile==='standard'?{postgres:{image:'postgres:17',environment:{POSTGRES_USER:'baize',POSTGRES_DB:'baize',POSTGRES_PASSWORD:'IsolatedAcceptanceOnly'},volumes:['pgdata:/var/lib/postgresql/data'],healthcheck:{test:['CMD-SHELL','pg_isready -U baize -d baize'],interval:'1s',timeout:'3s',retries:30}}}:{}},volumes:{data:{},keys:{},...profile==='standard'?{pgdata:{}}:{}},...profile==='standard'?{secrets:{master_key:{file:join(ops,'.baize/master.key')}}}:{}}),{mode:0o600});
 for(const name of ['data','keys']){docker('volume','create',project+'_'+name);docker('run','--rm','--pull=never','--user','0','-v',project+'_'+name+':/fixture','node:24-bookworm-slim','chown','1000:1000','/fixture');docker('run','--rm','--pull=never','--user','0','-v',project+'_'+name+':/fixture','node:24-bookworm-slim','chmod','700','/fixture');}
 const cargs=['compose','--project-name',project,'--env-file',env,'-f',compose];docker(...cargs,'up','-d','--no-build','--pull','never');
 let ready=false;for(let i=0;i<120;i++){try{const h=await fetch(url+'/healthz');if(h.ok){ready=true;break;}}catch{}await new Promise(d=>setTimeout(d,250));}if(!ready)throw Error(profile+' initial health failed');
 const nonce=JSON.parse(docker(...cargs,'exec','-T','app','cat','/app/keys/install-nonce.json')).nonce;
 const setup=await req(url,'/api/setup',{email:'owner@fixture.invalid',password:'ControlledFixtureOnly!12',installationNonce:nonce});if(setup.status!==200||!setup.cookie)throw Error('setup failed '+JSON.stringify(setup));
 const config:DockerConfig={version:1,initialContainerId:JSON.parse(docker('inspect',docker(...cargs,'ps','-q','app').trim()))[0].Id,ownerId:setup.json.user.id,agentDir:join(r,'agent'),socketDir:join(r,'socket'),dockerBinary:'/usr/local/bin/docker',dockerRoot:'/var/lib/docker',project,composeFile:compose,composeSha256:digest(readFileSync(compose)),envFile:env,healthUrl:url,source:{url:`http://127.0.0.1:${(source.address()as any).port}/`,keys:{'LOCAL-ACCEPTANCE':kp.publicKey.export({format:'pem',type:'spki'}).toString()},allowLocalFixture:true},initial:{imageId:ids[0]!,releaseId:revs[0]!,manifestDigest:delta.base.manifestDigest,schemaFingerprint:schema,profile},backupMode:profile==='standard'?'standard-pg-only':'lite',...profile==='standard'?{opsRoot:ops,backupSupportHashes:Object.fromEntries(support.map(n=>[n,digest(readFileSync(n))]))}:{},postgresUser:'baize',postgresDatabase:'baize'};
 writeFileSync(join(r,'private-config.json'),JSON.stringify(config),{mode:0o600});const agent=new DockerAgent(config);
 try{
  await agent.open();const cookie=setup.cookie;const before=await req(url,'/api/v1/sites',{name:'Before update',domain:'before.fixture.invalid'},cookie);if(before.status!==201)throw Error('initial write failed');
  await agent.check(config.ownerId);const expected={revision:delta.target.releaseId,manifestSha256:delta.target.manifestDigest.slice(7)},requestStart=requests.length;
  const upgraded=await agent.apply(config.ownerId,randomUUID(),false,expected);if(upgraded.phase!=='completed'||!upgraded.backupCreated)throw Error('upgrade incomplete');
  if(!(await(await fetch(url+'/assets/update-fixture.js')).text()).includes('"B"'))throw Error('target file missing');
  const post=await req(url,'/api/v1/sites',{name:'After update',domain:'after.fixture.invalid'},cookie);if(post.status!==201)throw Error('post-update write failed');
  const rolled=await agent.apply(config.ownerId,randomUUID(),true);if(rolled.phase!=='rolled_back')throw Error('rollback incomplete');
  const sites=await req(url,'/api/v1/sites',undefined,cookie);if(!sites.json.sites.some((s:any)=>s.name==='Before update')||!sites.json.sites.some((s:any)=>s.name==='After update'))throw Error('data lost');
  if(!(await(await fetch(url+'/assets/update-fixture.js')).text()).includes('"A"'))throw Error('base file missing after rollback');
  const verification=JSON.parse(readFileSync(join(config.agentDir,'images',String(upgraded.operationId),'verification.json'),'utf8'));
  results.push({profile,realApplication:true,realDatabase:profile==='standard'?'PostgreSQL':'SQLite',productionBackupMode:config.backupMode,source:'isolated loopback signed fixture',upgrade:upgraded,rollback:rolled,verification,downloadRequests:requests.slice(requestStart),bothWritesSurvived:true,configPreserved:readFileSync(env,'utf8')==='POSTGRES_PASSWORD=IsolatedAcceptanceOnly\n'});
  writeFileSync(join(root,'DOCKER_INCREMENTAL_E2E.json'),JSON.stringify({results},null,2));console.log('PASSED '+profile);
 }finally{await agent.close();await new Promise<void>(done=>source.close(()=>done()));}
}
