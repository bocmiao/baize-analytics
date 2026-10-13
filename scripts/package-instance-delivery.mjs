import {execFileSync,spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,readdirSync,statfsSync,existsSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {createGzip} from 'node:zlib';
import {createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {stageRuntime} from './runtime-stage.mjs';
import {stageLiteRuntime} from './runtime-stage-lite.mjs';
import {packageRelease} from './package-release.mjs';
const root=resolve(process.argv[2]??'');if(!process.argv[2]||process.argv[2]!==root||existsSync(root))throw Error('New absolute delivery directory required');
const source=process.cwd(),run=(bin,args)=>execFileSync(bin,args,{encoding:'utf8',maxBuffer:8*1024*1024});
if(run('git',['status','--porcelain']).trim())throw Error('Frozen clean checkout required');const revision=run('git',['rev-parse','HEAD']).trim();mkdirSync(root,{recursive:true,mode:0o700});
const hash=b=>createHash('sha256').update(b).digest('hex'),results=[];
function space(){const s=statfsSync(root);if(s.bavail*s.bsize<4*1073741824)throw Error('Delivery space protection');}
for(const profile of ['standard','lite']){
 space();const runtime=join(root,profile+'-runtime');(profile==='lite'?stageLiteRuntime:stageRuntime)(source,runtime);
 const schemaPath=`dist/server/src/${profile==='lite'?'lite/schema':'server/db'}.js`,schemaEntries=readdirSync(join(runtime,'db/migrations')).map(n=>['db/migrations/'+n,hash(readFileSync(join(runtime,'db/migrations',n)))]);schemaEntries.push([schemaPath,hash(readFileSync(join(runtime,schemaPath)))]);schemaEntries.sort((a,b)=>a[0].localeCompare(b[0]));const schema=hash(JSON.stringify(schemaEntries));
 const tag=`baize-delivery-${profile}:${revision.slice(0,7)}`;
 writeFileSync(join(runtime,'Dockerfile.delivery'),`FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20\nWORKDIR /app\nENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data KEYS_DIR=/app/keys BAIZE_DEPLOYMENT_MODE=docker BAIZE_BUILD_REVISION=${revision}\nCOPY --chown=node:node . /app\nRUN mkdir -p /app/data /app/keys && chown node:node /app/data /app/keys && chmod 700 /app/data /app/keys\nLABEL org.opencontainers.image.revision="${revision}" org.opencontainers.image.source="https://github.com/bocmiao/baize-analytics" io.baize.release-id="${revision}" io.baize.profile="${profile}" io.baize.schema-fingerprint="${schema}"\nUSER node\nCMD ["node","dist/server/src/${profile==='lite'?'lite':'server'}/main.js"]\n`);
 run('docker',['build','--pull=false','--network','none','-f',join(runtime,'Dockerfile.delivery'),'-t',tag,runtime]);const imageId=run('docker',['image','inspect',tag,'--format','{{.Id}}']).trim();
 for(const variant of ['node-ready','bundled-node']){space();const output=join(root,`baize-${profile}-${variant}-linux-x64-${revision.slice(0,7)}`);const r=packageRelease({image:imageId,revision,profile,variant,output,sourceRoot:source});results.push({kind:'native',profile,variant,revision,imageId,file:basename(r.archive),bytes:r.archiveBytes,sha256:r.archiveSha256});writeFileSync(join(root,'DELIVERY_INDEX.json'),JSON.stringify(results,null,2));}
 space();const archive=join(root,`baize-${profile}-docker-offline-${revision.slice(0,7)}.tar.gz`),images=profile==='standard'?[tag,'postgres:17-bookworm','redis:7-bookworm']:[tag];const ids=images.map(name=>({tag:name,imageId:run('docker',['image','inspect',name,'--format','{{.Id}}']).trim()}));const child=spawn('docker',['image','save',...images],{stdio:['ignore','pipe','inherit']});const exited=new Promise((r,j)=>{child.on('error',j);child.on('exit',code=>code===0?r():j(Error('image save failed')));});await pipeline(child.stdout,createGzip({level:1}),createWriteStream(archive,{mode:0o600}));await exited;run('gzip',['-t',archive]);const b=readFileSync(archive);results.push({kind:'docker-offline',profile,revision,imageId,images:ids,file:basename(archive),bytes:b.length,sha256:hash(b)});writeFileSync(join(root,'DELIVERY_INDEX.json'),JSON.stringify(results,null,2));
}
writeFileSync(join(root,'SHA256SUMS'),results.map(r=>r.sha256+'  '+r.file+'\n').join(''));console.log(JSON.stringify({revision,results},null,2));
