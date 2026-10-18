import {sign,createPrivateKey,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync,copyFileSync,chmodSync,lstatSync,renameSync,openSync,closeSync,fsyncSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {agentConfigSchema} from './agent.js';
import {verifyUpdateRelease} from './release.js';
import {authenticateSignedPayload,parseRelease,digest} from './protocol.js';
import {safeAncestors,assertDisjoint,pathWithin} from '../release/preflight.js';
import {privateDirectory,trustedJSON,syncDirectory} from './state.js';

export function publishPhpInstall(root:string,output:string,keyFile:string,keyId:string,fixture=false){
 root=resolve(root);output=resolve(output);keyFile=resolve(keyFile);assertDisjoint([root,output,keyFile]);const m=verifyUpdateRelease(root);
 if(m.variant!=='php-fpm')throw Error('UPDATE_PHP_RELEASE_REQUIRED');
 const php=JSON.parse(readFileSync(join(root,'php-release-manifest.json'),'utf8'));if(php.workingTreeChanges&&!fixture)throw Error('UPDATE_DIRTY_RELEASE_REQUIRES_REBUILD');
 safeAncestors(keyFile);const s=lstatSync(keyFile);if(!s.isFile()||s.nlink!==1||(s.mode&0o777)!==0o600||s.uid!==process.getuid!()||s.size>8192)throw Error('UPDATE_SIGNING_KEY_FILE_UNTRUSTED');
 const key=createPrivateKey(readFileSync(keyFile));if(key.asymmetricKeyType!=='ed25519')throw Error('UPDATE_SIGNING_ALGORITHM_INVALID');if(!/^[A-Za-z0-9._-]{1,80}$/.test(keyId))throw Error('UPDATE_SIGNING_KEY_ID_INVALID');
 if(existsSync(output))throw Error('UPDATE_PUBLISH_OUTPUT_EXISTS');mkdirSync(output,{mode:0o700});mkdirSync(join(output,'blobs'),{mode:0o700});
 for(const e of m.files){if(e.type==='symlink')throw Error('UPDATE_PHP_PRIVATE_OR_LINK_FORBIDDEN');const blob=join(output,'blobs',e.sha256);if(!existsSync(blob))copyFileSync(join(root,e.path),blob);}
 const body=JSON.stringify({format:'baize-php-install-v1',releaseManifest:readFileSync(join(root,'release-manifest.json'),'utf8'),fixture});
 writeFileSync(join(output,'install.json'),JSON.stringify({body,keyId,signature:sign(null,Buffer.from(body),key).toString('base64')}),{mode:0o600});
 return {revision:m.revision,manifestSha256:digest(readFileSync(join(root,'release-manifest.json'))),files:m.files.length,fixture,uploaded:false};
}

export function installPhpRelease(configPath:string,bundle:string){
 if(process.getuid?.()===0)throw Error('UPDATE_NATIVE_EXECUTOR_MUST_BE_NONROOT');
 const config=agentConfigSchema.parse(trustedJSON(resolve(configPath)));if(!config.php)throw Error('UPDATE_PHP_CONFIG_REQUIRED');bundle=resolve(bundle);
 assertDisjoint([bundle,config.agentDir,config.releasesDir,config.dataDir,config.keyDir,config.envFile,config.php.configPath]);
 if(!pathWithin(config.releasesDir,config.initialRoot)||config.initialRoot===config.releasesDir||existsSync(config.initialRoot))throw Error('UPDATE_INSTALL_TARGET_MUST_BE_NEW');
 const read=(path:string,max:number)=>{safeAncestors(path);const s=lstatSync(path);if(!s.isFile()||s.nlink!==1||s.size>max)throw Error('UPDATE_IMPORT_FILE_INVALID');return readFileSync(path);};
 const payload=authenticateSignedPayload(JSON.parse(read(join(bundle,'install.json'),24*1024*1024).toString()),config.source.keys) as {format:string;releaseManifest:string;fixture?:boolean};
 if(payload.format!=='baize-php-install-v1'||typeof payload.releaseManifest!=='string'||payload.fixture&&!config.source.allowLocalFixture)throw Error('UPDATE_INSTALL_PAYLOAD_INVALID');
 const m=parseRelease(payload.releaseManifest);if(m.variant!=='php-fpm'||digest(payload.releaseManifest)!==config.initialManifestSha256)throw Error('UPDATE_INITIAL_MANIFEST_PIN_MISMATCH');
 for(const e of m.files){const bytes=read(join(bundle,'blobs',e.sha256),e.bytes);if(e.type==='symlink'||e.path==='private'||e.path.startsWith('private/')||bytes.length!==e.bytes||digest(bytes)!==e.sha256)throw Error('UPDATE_BLOB_INTEGRITY_FAILED');}
 privateDirectory(config.releasesDir);safeAncestors(config.initialRoot);if(dirname(config.initialRoot)!==config.releasesDir)throw Error('UPDATE_INSTALL_DIRECT_CHILD_REQUIRED');
 const stage=join(config.releasesDir,'.install-'+randomUUID());mkdirSync(stage,{mode:0o700});
 for(const d of [...m.directories].sort((a,b)=>a.path.split('/').length-b.path.split('/').length))mkdirSync(join(stage,d.path),{mode:0o700});
 for(const e of m.files){const p=join(stage,e.path);copyFileSync(join(bundle,'blobs',e.sha256),p);chmodSync(p,e.mode);const fd=openSync(p,'r');fsyncSync(fd);closeSync(fd);}
 writeFileSync(join(stage,'release-manifest.json'),payload.releaseManifest,{mode:0o444});const fd=openSync(join(stage,'release-manifest.json'),'r');fsyncSync(fd);closeSync(fd);
 for(const d of [...m.directories].sort((a,b)=>b.path.split('/').length-a.path.split('/').length)){chmodSync(join(stage,d.path),d.mode);syncDirectory(join(stage,d.path));}syncDirectory(stage);verifyUpdateRelease(stage);chmodSync(stage,0o555);renameSync(stage,config.initialRoot);syncDirectory(config.releasesDir);
 return {installed:true,revision:m.revision,manifestSha256:config.initialManifestSha256,instanceConfigurationChanged:false,servicesStarted:false};
}

const args=process.argv.slice(2);if(args[0]==='--publish'&&args[2]==='--output'&&args[4]==='--key-file'&&args[6]==='--key-id'&&args.length===8)console.log(JSON.stringify(publishPhpInstall(args[1]!,args[3]!,args[5]!,args[7]!)));
else if(args[0]==='--config'&&args[2]==='--bundle'&&args.length===4)console.log(JSON.stringify(installPhpRelease(args[1]!,args[3]!)));
