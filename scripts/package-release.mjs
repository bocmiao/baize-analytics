import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chmodSync,existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,readlinkSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {basename,dirname,isAbsolute,join,normalize,relative,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const sha256=value=>createHash('sha256').update(value).digest('hex');
const inside=(root,path)=>path===root||path.startsWith(root+sep);
function command(file,args,options={}){return execFileSync(file,args,{encoding:'utf8',maxBuffer:16*1024*1024,...options});}
export const documentationWhitelist=Object.freeze(['deploy/baize.service.example','README.md','docs/deployment-methods.md','docs/release-native-ops.md','docs/release-packages.md','docs/lite-deployment.md','docs/lite-migration.md','docs/lite-implementation.md','docs/lite-optional-insights.md','docs/migration.md','docs/api.md']);
export const releaseReadmeNotice='> 运行包说明：本包主要运行维护指南离线可用；源码和历史材料的固定 SHA 仓库链接需要网络及私有仓库权限。\n\n';
export function rewriteDocumentationLinks(text,sourcePath,revision,included=documentationWhitelist){
 const available=new Set(included),rewritten=[];
 const content=text.replace(/(\]\()([^\s)]+)([^)]*\))/g,(match,prefix,target,suffix)=>{
  if(target.startsWith('#')||/^[a-z][a-z\d+.-]*:/i.test(target)||target.startsWith('//'))return match;
  const parts=target.match(/^([^?#]*)(.*)$/),pathname=parts[1];if(!pathname)return match;
  const path=normalize(join(dirname(sourcePath),pathname)).split(sep).join('/');
  if(path.startsWith('../')||isAbsolute(path))throw Error('RELEASE_DOCUMENTATION_LINK_ESCAPE');
  if(available.has(path))return match;
  const url=`https://github.com/bocmiao/baize-analytics/${pathname.endsWith('/')?'tree':'blob'}/${revision}/${path.split('/').map(encodeURIComponent).join('/')}${parts[2]}`;
  rewritten.push({from:target,to:url});return prefix+url+suffix;
 });
 return {content,rewritten};
}
export function exportReleaseDocumentation(sourceRoot,revision,output){
 if(!/^[a-f0-9]{40}$/.test(revision))throw Error('RELEASE_DOCUMENTATION_REVISION_INVALID');
 return documentationWhitelist.map(path=>{
  const bytes=command('git',['show',`${revision}:${path}`],{cwd:sourceRoot,encoding:null});
  const gitBlobId=command('git',['rev-parse',`${revision}:${path}`],{cwd:sourceRoot}).trim();
  if(createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex')!==gitBlobId)throw Error('RELEASE_DOCUMENTATION_BLOB_MISMATCH');
  const derived=['README.md','docs/api.md','docs/migration.md'].includes(path)?rewriteDocumentationLinks(bytes.toString('utf8'),path,revision):{content:bytes,rewritten:[]};
  const readmeNoticeAdded=path==='README.md';
  const releaseBytes=Buffer.from(readmeNoticeAdded?releaseReadmeNotice+derived.content:derived.content),destination=join(output,path);mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,releaseBytes);
  return {path,revision,gitBlobId,sourceSha256:sha256(bytes),sourceBytes:bytes.length,derivedDocSha256:sha256(releaseBytes),bytes:releaseBytes.length,derivedLinksOnly:derived.rewritten.length>0,readmeNoticeAdded,rewrittenLinks:derived.rewritten};
 });
}
export function deriveRuntimePackage(root){
 const source=readFileSync(join(root,'package.json')),original=JSON.parse(source),lock=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8'));
 if(!original.scripts||lock.name!==original.name||lock.version!==original.version||JSON.stringify(lock.packages?.['']?.dependencies)!==JSON.stringify(original.dependencies))throw Error('RELEASE_PACKAGE_LOCK_IDENTITY_MISMATCH');
 let installedPackageVersionChecks=0;
 function dependencies(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){
  if(entry.name.startsWith('.'))continue;const path=join(directory,entry.name);
  if(entry.name.startsWith('@')&&entry.isDirectory()){dependencies(path);continue;}
  if(!entry.isDirectory())continue;const metadata=JSON.parse(readFileSync(join(path,'package.json'),'utf8')),key=relative(root,path).split(sep).join('/');
  if(metadata.version!==lock.packages[key]?.version)throw Error('RELEASE_INSTALLED_VERSION_MISMATCH:'+key);installedPackageVersionChecks++;
  if(existsSync(join(path,'node_modules')))dependencies(join(path,'node_modules'));
 }}
 dependencies(join(root,'node_modules'));
 writeFileSync(join(root,'source-package.json'),source);
 const derived={...original,scripts:{...original.scripts,start:'node dist/server/src/release/panel-start.js'}};
 writeFileSync(join(root,'package.json'),JSON.stringify(derived,null,2)+'\n');
 return {sourcePackageSha256:sha256(source),runtimePackageDerived:true,installedPackageVersionChecks};
}
export function releaseFiles(root,{seal=false}={}) {
 root=resolve(root);const files=[],directories=[];
 function walk(directory){
  for(const name of readdirSync(directory).sort()){
   const path=join(directory,name),key=relative(root,path).split(sep).join('/'),stat=lstatSync(path);
   if(key==='release-manifest.json')continue;
   if(['.git','.cache','.baize','__pycache__'].includes(name)||name==='.env'||(/^\.env\./.test(name))||(!key.includes('/')&&['data','keys','data-keys','backups','secrets'].includes(name)))throw Error('RELEASE_FORBIDDEN_PATH:'+key);
   if(stat.isSymbolicLink()){
    const target=readlinkSync(path);if(isAbsolute(target)||!inside(root,resolve(dirname(path),target)))throw Error('RELEASE_LINK_ESCAPE:'+key);
    try{if(!inside(root,realpathSync(path)))throw Error('escape');}catch{throw Error('RELEASE_LINK_TARGET_INVALID:'+key);}
    files.push({path:key,type:'symlink',target,bytes:Buffer.byteLength(target),sha256:sha256(target),mode:stat.mode&0o777});
   }else if(stat.isDirectory()){
    walk(path);if(seal)chmodSync(path,0o555);directories.push({path:key,mode:lstatSync(path).mode&0o777});
   }else if(stat.isFile()){
    if(stat.nlink!==1)throw Error('RELEASE_HARDLINK_UNSUPPORTED:'+key);
    if(seal)chmodSync(path,stat.mode&0o111?0o555:0o444);
    files.push({path:key,type:'file',bytes:stat.size,sha256:sha256(readFileSync(path)),mode:lstatSync(path).mode&0o777});
   }else throw Error('RELEASE_NONREGULAR_FILE:'+key);
  }
 }
 walk(root);return {files:files.sort((a,b)=>a.path.localeCompare(b.path)),directories:directories.sort((a,b)=>a.path.localeCompare(b.path))};
}
export function verifyRelease(root){
 root=resolve(root);const path=join(root,'release-manifest.json');const manifestStat=lstatSync(path);if(!manifestStat.isFile()||manifestStat.nlink!==1)throw Error('RELEASE_MANIFEST_INVALID');
 const manifest=JSON.parse(readFileSync(path,'utf8'));
 if(manifest.version!==1||!['standard','lite'].includes(manifest.profile)||!['node-ready','bundled-node'].includes(manifest.variant)||!/^[a-f0-9]{40}$/.test(manifest.revision)||!/^sha256:[a-f0-9]{64}$/.test(manifest.imageId)||manifest.platform?.os!=='linux'||manifest.platform?.architecture!=='amd64')throw Error('RELEASE_MANIFEST_INVALID');
 const actual=releaseFiles(root);if(JSON.stringify(actual.files)!==JSON.stringify(manifest.files)||JSON.stringify(actual.directories)!==JSON.stringify(manifest.directories))throw Error('RELEASE_CONTENT_MISMATCH');
 if(manifest.provenance){
  const source=readFileSync(join(root,'source-package.json')),original=JSON.parse(source),derived=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
  if(manifest.provenance.runtimePackageDerived!==true||manifest.provenance.sourcePackageSha256!==sha256(source)||JSON.stringify(derived)!==JSON.stringify({...original,scripts:{...original.scripts,start:'node dist/server/src/release/panel-start.js'}}))throw Error('RELEASE_PACKAGE_DERIVATION_INVALID');
 }
 return manifest;
}
export function packageRelease({image,revision,profile,variant,output,sourceRoot}){
 if(!image||!/^[a-f0-9]{40}$/.test(revision)||!['standard','lite'].includes(profile)||!['node-ready','bundled-node'].includes(variant))throw Error('Usage: --image IMAGE --revision FULL_SHA --profile standard|lite --variant node-ready|bundled-node --output NEW_DIR --source-root CLEAN_CHECKOUT');
 sourceRoot=resolve(sourceRoot??'.');output=resolve(output);
 if(existsSync(output)||existsSync(output+'.tar.gz')||inside(sourceRoot,output))throw Error('RELEASE_OUTPUT_EXISTS_OR_INSIDE_SOURCE');
 const changes=command('git',['status','--porcelain'],{cwd:sourceRoot}).trim().split('\n').filter(Boolean).filter(line=>line!=='?? node_modules');
 if(command('git',['rev-parse','HEAD'],{cwd:sourceRoot}).trim()!==revision||changes.length)throw Error('RELEASE_SOURCE_NOT_FROZEN');
 const metadata=command('docker',['image','inspect',image,'--format','{{json .Id}}|{{json .Architecture}}|{{json .Os}}|{{json .Config.Cmd}}|{{json .Config.Labels}}']).trim().split('|').map(value=>JSON.parse(value)).reduce((object,value,index)=>({...object,[['id','architecture','os','cmd','labels'][index]]:value}),{});
 // The publisher accepts an immutable local image ID after verifying its source identity.
 const main=`dist/server/src/${profile==='lite'?'lite':'server'}/main.js`;
 if(metadata.os!=='linux'||metadata.architecture!=='amd64'||metadata.labels?.['org.opencontainers.image.revision']!==revision||metadata.labels?.['org.opencontainers.image.source']!=='https://github.com/bocmiao/baize-analytics'||JSON.stringify(metadata.cmd)!==JSON.stringify(['node',main]))throw Error('RELEASE_IMAGE_PROFILE_OR_REVISION_MISMATCH');
 const scratch=mkdtempSync(join(tmpdir(),'baize-release-publisher-'));let container;
 try{
  container=command('docker',['create','--network','none','--entrypoint','node',metadata.id]).trim();
  // Fail before publishing anything when an older image lacks the release interface.
  for(const path of ['dist/server/src/release/preflight.js','dist/server/src/release/panel-start.js','dist/server/src/release/standard-ops.js','scripts/release-start.sh','scripts/release-ops.sh']){
   try{command('docker',['cp',`${container}:/app/${path}`,join(scratch,basename(path))]);}catch{throw Error('RELEASE_IMAGE_TOOLS_MISSING:'+path);}
  }
  mkdirSync(output,{recursive:true});
  for(const path of ['dist','public','db','node_modules','package.json','package-lock.json','LICENSE'])command('docker',['cp',`${container}:/app/${path}`,join(output,path)]);
  mkdirSync(join(output,'scripts'));
  for(const name of ['release-start.sh','release-ops.sh'])command('docker',['cp',`${container}:/app/scripts/${name}`,join(output,'scripts',name)]);
  for(const path of ['package.json','package-lock.json','LICENSE','scripts/release-start.sh','scripts/release-ops.sh']){
   if(sha256(readFileSync(join(output,path)))!==sha256(readFileSync(join(sourceRoot,path))))throw Error('RELEASE_SOURCE_FILE_MISMATCH:'+path);
  }
  // A fixed official Node binary and its upstream notice are taken from the SAME image.
  const binary=join(scratch,'node');command('docker',['cp',`${container}:/usr/local/bin/node`,binary]);chmodSync(binary,0o555);
  const runtime=JSON.parse(command(binary,['--input-type=module','-e',"import{DatabaseSync}from'node:sqlite';const d=new DatabaseSync(':memory:');console.log(JSON.stringify({nodeVersion:process.version,nodeArch:process.arch,sqlite:d.prepare('SELECT sqlite_version() version,sqlite_source_id() sourceId').get()}));d.close();"],{stdio:['ignore','pipe','pipe']}).trim());
  const versions=command('readelf',['--version-info',binary]);
  const glibc=[...versions.matchAll(/\bGLIBC_(\d+\.\d+(?:\.\d+)?)\b/g)].map(m=>m[1]).sort((a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<Math.max(x.length,y.length);i++)if((x[i]??0)!==(y[i]??0))return(x[i]??0)-(y[i]??0);return 0;});
  if(!glibc.length||runtime.nodeArch!=='x64')throw Error('RELEASE_NODE_PLATFORM_UNVERIFIED');
  const needed=[...command('readelf',['--dynamic',binary]).matchAll(/Shared library: \[([^\]]+)\]/g)].map(m=>m[1]);
  const requiredSymbolVersions=[...new Set([...versions.matchAll(/\b(?:GLIBC|GLIBCXX|CXXABI)_[\d.]+\b/g)].map(m=>m[0]))].sort();
  const nodeSha256=sha256(readFileSync(binary));
  if(variant==='bundled-node'){
   mkdirSync(join(output,'runtime','bin'),{recursive:true});command('docker',['cp',`${container}:/usr/local/bin/node`,join(output,'runtime','bin','node')]);
   mkdirSync(join(output,'runtime','licenses'),{recursive:true});command('docker',['cp',`${container}:/usr/local/LICENSE`,join(output,'runtime','licenses','NODE-LICENSE')]);
   for(const name of ['libc6','libstdc++6','libgcc-s1','libatomic1']){
    try{command('docker',['cp',`${container}:/usr/share/doc/${name}/copyright`,join(output,'runtime','licenses',name+'-copyright')]);}catch{throw Error('RELEASE_BASE_LICENSE_MISSING:'+name);}
   }
  }
  const originalPackage=JSON.parse(readFileSync(join(output,'package.json'),'utf8'));
  if(originalPackage.type!=='module'||!existsSync(join(output,main)))throw Error('RELEASE_RUNTIME_INCOMPLETE');
  const provenance=deriveRuntimePackage(output);
  provenance.documentation=exportReleaseDocumentation(sourceRoot,revision,output);
  const requiredHostCommands=['bash','flock','sh','cat',...(profile==='standard'?['pg_dump','pg_restore','createdb','psql']:[])];
  const manifest={version:1,profile,variant,revision,imageId:metadata.id,platform:{os:'linux',architecture:'amd64'},provenance,runtime:{...runtime,nodeBinarySha256:nodeSha256,bundled:variant==='bundled-node',glibcMinimum:glibc.at(-1),requiredSharedLibraries:needed,requiredSymbolVersions,requiredHostCommands},...releaseFiles(output,{seal:true})};
  writeFileSync(join(output,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o444});chmodSync(join(output,'release-manifest.json'),0o444);chmodSync(output,0o555);verifyRelease(output);
  mkdirSync(dirname(output),{recursive:true});const archive=output+'.tar.gz';
  command('tar',['--sort=name','--mtime=@0','--owner=0','--group=0','--numeric-owner','-czf',archive,'-C',dirname(output),basename(output)]);
  command('gzip',['-t',archive]);
  const check=join(scratch,'unpack');mkdirSync(check);command('tar',['-xzf',archive,'-C',check]);verifyRelease(join(check,basename(output)));
  return {manifest,archive,archiveBytes:lstatSync(archive).size,archiveSha256:sha256(readFileSync(archive)),expandedRegularFileBytes:manifest.files.filter(f=>f.type==='file').reduce((sum,f)=>sum+f.bytes,0)};
 }finally{
  if(container)command('docker',['rm','--volumes',container]);
  function writable(path){if(!existsSync(path))return;const stat=lstatSync(path);if(stat.isDirectory()){chmodSync(path,0o700);for(const entry of readdirSync(path))writable(join(path,entry));}}
  writable(scratch);rmSync(scratch,{recursive:true,force:true});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args[0]==='--verify'){console.log(JSON.stringify(verifyRelease(args[1])));}else{
  const options={};for(let i=0;i<args.length;i+=2){const name=args[i];if(!['--image','--revision','--profile','--variant','--output','--source-root'].includes(name)||!args[i+1])throw Error('RELEASE_ARGUMENT_INVALID');options[name.slice(2).replace(/-([a-z])/g,(_,s)=>s.toUpperCase())]=args[i+1];}
  const result=packageRelease(options);console.log(JSON.stringify({archive:result.archive,bytes:result.archiveBytes,sha256:result.archiveSha256,expandedRegularFileBytes:result.expandedRegularFileBytes,profile:result.manifest.profile,variant:result.manifest.variant,revision:result.manifest.revision,imageId:result.manifest.imageId}));
 }
}
