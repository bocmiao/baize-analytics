import {verifyUpdateRelease as verifyRelease} from './release.js';
import {readFileSync,mkdirSync,copyFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {assertDisjoint} from '../release/preflight.js';
import {parseRelease,difference,schemaFingerprint,digest,signDelta,payloadPlan,type Delta} from './protocol.js';

/** Produces only changed content blobs and a signed manifest; no full-package fallback exists. */
export function publishDelta(options:{baseRoot:string;targetRoot:string;output:string;privateKey:string;keyId:string;label:string;notes:string[];fixture?:boolean}){
 const baseRoot=resolve(options.baseRoot),targetRoot=resolve(options.targetRoot),output=resolve(options.output);assertDisjoint([baseRoot,targetRoot,output]);
 if(existsSync(output))throw Error('UPDATE_PUBLISH_OUTPUT_EXISTS');verifyRelease(baseRoot);verifyRelease(targetRoot);
 const baseBytes=readFileSync(join(baseRoot,'release-manifest.json'),'utf8'),targetBytes=readFileSync(join(targetRoot,'release-manifest.json'),'utf8'),base=parseRelease(baseBytes),target=parseRelease(targetBytes);
 if(base.profile!==target.profile||base.variant!==target.variant||schemaFingerprint(base)!==schemaFingerprint(target))throw Error('UPDATE_SCHEMA_OR_PROFILE_CHANGE_REQUIRES_OPERATOR');
 if(target.variant==='php-fpm'&&JSON.parse(readFileSync(join(targetRoot,'php-release-manifest.json'),'utf8')).workingTreeChanges&&!options.fixture)throw Error('UPDATE_DIRTY_RELEASE_REQUIRES_REBUILD');
 const delta:Delta={format:'baize-file-delta-v1',base:{revision:base.revision,manifestSha256:digest(baseBytes)},releaseManifest:targetBytes,label:options.label,notes:options.notes,compatibility:{profile:target.profile,variant:target.variant,nodeMajor:24,schema:'same-schema',schemaFingerprint:schemaFingerprint(base)},...difference(base,target),...(options.fixture?{fixture:true}:{})};
 const plan=payloadPlan(delta,base);mkdirSync(output,{mode:0o700});mkdirSync(join(output,'blobs'),{mode:0o700});
 for(const [hash]of plan.blobs){const entry=delta.changed.find(e=>e.sha256===hash&&e.type!=='symlink')!;copyFileSync(join(targetRoot,entry.path),join(output,'blobs',hash));}
 const bytes=JSON.stringify(signDelta(delta,options.keyId,options.privateKey));writeFileSync(join(output,'latest.json'),bytes,{mode:0o600});
 return {sourceRevision:target.revision,baseRevision:base.revision,payloadBytes:plan.bytes,metadataBytes:Buffer.byteLength(bytes),changedFiles:delta.changed.map(e=>e.path),unchangedFiles:target.files.filter(e=>!delta.changed.some(c=>c.path===e.path)).map(e=>e.path),deletedFiles:delta.deletedFiles,deletedDirectories:delta.deletedDirectories,fullReleaseBytes:target.files.reduce((sum,e)=>sum+e.bytes,0),fullFallbackAvailable:false};
}
