import {readFileSync,existsSync,lstatSync,writeFileSync,copyFileSync,chmodSync,openSync,closeSync,fsyncSync,renameSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {agentConfigSchema} from './agent.js';
import {authenticateDelta,validateDelta,payloadPlan,digest} from './protocol.js';
import {verifyUpdateRelease} from './release.js';
import {privateDirectory,trustedJSON,syncDirectory,type Pointer} from './state.js';
import {safeAncestors,assertDisjoint} from '../release/preflight.js';

/** Operator-only import: authenticate everything before publishing latest atomically. */
export function importOffline(configPath:string,bundle:string){
 const config=agentConfigSchema.parse(trustedJSON(configPath));if(!config.source.offlineDirectory)throw Error('UPDATE_OFFLINE_SOURCE_NOT_CONFIGURED');
 const destination=resolve(config.source.offlineDirectory);bundle=resolve(bundle);assertDisjoint([destination,bundle]);
 const currentPath=join(config.agentDir,'current.json'),pointer=existsSync(currentPath)?trustedJSON<Pointer>(currentPath):{root:config.initialRoot,manifestSha256:config.initialManifestSha256};
 if(!pointer.root.startsWith(config.releasesDir+'/'))throw Error('UPDATE_POINTER_INVALID');verifyUpdateRelease(pointer.root);
 const base=readFileSync(join(pointer.root,'release-manifest.json'),'utf8');if(digest(base)!==pointer.manifestSha256)throw Error('UPDATE_INSTALLED_MANIFEST_CHANGED');
 const read=(path:string,max:number)=>{safeAncestors(path);const s=lstatSync(path);if(!s.isFile()||s.nlink!==1||s.size>max)throw Error('UPDATE_IMPORT_FILE_INVALID');return readFileSync(path);};
 const signed=read(join(bundle,'latest.json'),24*1024*1024),delta=authenticateDelta(JSON.parse(signed.toString()),config.source.keys);if(delta.fixture&&!config.source.allowLocalFixture)throw Error('UPDATE_FIXTURE_NOT_PRODUCTION_RELEASE');
 const {base:manifest}=validateDelta(delta,base),plan=payloadPlan(delta,manifest);for(const [hash,bytes]of plan.blobs){const b=read(join(bundle,'blobs',hash),bytes);if(b.length!==bytes||digest(b)!==hash)throw Error('UPDATE_BLOB_INTEGRITY_FAILED');}
 privateDirectory(destination);privateDirectory(join(destination,'blobs'));
 for(const [hash,bytes]of plan.blobs){const path=join(destination,'blobs',hash);if(existsSync(path)){if(digest(read(path,bytes))!==hash)throw Error('UPDATE_BLOB_INTEGRITY_FAILED');continue;}copyFileSync(join(bundle,'blobs',hash),path);chmodSync(path,0o600);const fd=openSync(path,'r');fsyncSync(fd);closeSync(fd);}syncDirectory(join(destination,'blobs'));
 const pending=join(destination,'latest.pending');if(existsSync(pending))throw Error('UPDATE_IMPORT_PENDING_REQUIRES_OPERATOR_REVIEW');const fd=openSync(pending,'wx',0o600);try{writeFileSync(fd,signed);fsyncSync(fd);}finally{closeSync(fd);}renameSync(pending,join(destination,'latest.json'));syncDirectory(destination);
 return {imported:true,revision:JSON.parse(delta.releaseManifest).revision,payloadBytes:plan.bytes,productionSourceConfigured:false};
}
if(process.argv[2]==='--config'&&process.argv[4]==='--bundle'&&process.argv.length===6)console.log(JSON.stringify(importOffline(resolve(process.argv[3]!),resolve(process.argv[5]!))));
