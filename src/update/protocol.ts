import {createHash,sign,verify,createPublicKey,createPrivateKey} from 'node:crypto';
import {z} from 'zod';
import {posix} from 'node:path';

export const digest=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
export const operationFingerprint=(action:'apply'|'rollback',expected?:{revision:string;manifestSha256:string})=>digest(JSON.stringify([action,expected?.revision??null,expected?.manifestSha256??null]));
export const revision=z.string().regex(/^[a-f0-9]{40}$/);
const hash=z.string().regex(/^[a-f0-9]{64}$/);
export function safeReleasePath(value:string){
 if(!value||value.length>1024||value!==posix.normalize(value)||value.startsWith('/')||value.includes('\\')||/[\u0000-\u001f\u007f]/.test(value))return false;
 const parts=value.split('/');
 if(['data','keys','backups','secrets','update-state','.baize'].includes(parts[0]!))return false;
 return !parts.some(part=>['.','..','.git','.baize'].includes(part)||/^\.env(?:$|\.)/.test(part)||part==='install-nonce.json');
}
const path=z.string().refine(safeReleasePath,'UPDATE_PATH_FORBIDDEN');
const entry=z.object({path,bytes:z.number().int().min(0).max(128*1024*1024),sha256:hash,mode:z.number().int().refine(n=>[0o444,0o555,0o644,0o755,0o777].includes(n)),type:z.enum(['file','symlink']).optional(),target:z.string().max(1024).optional()}).strict();
const directory=z.object({path,mode:z.number().int().refine(n=>[0o555,0o755].includes(n))}).strict();
const variant=z.enum(['node-ready','bundled-node','php-fpm']);
const release=z.object({version:z.literal(1),profile:z.enum(['standard','lite']),revision,imageId:z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),runtime:z.literal('php').optional(),variant,platform:z.object({os:z.literal('linux'),architecture:z.literal('amd64')}).passthrough(),files:z.array(entry).max(100000),directories:z.array(directory).max(30000)}).passthrough().refine(m=>m.variant==='php-fpm'?m.runtime==='php'&&m.profile==='standard'&&m.imageId===undefined:!!m.imageId&&m.runtime===undefined,'UPDATE_RUNTIME_MANIFEST_INVALID');
export type UpdateEntry=z.infer<typeof entry>;
export type UpdateRelease=z.infer<typeof release>;
export const deltaSchema=z.object({format:z.literal('baize-file-delta-v1'),base:z.object({revision,manifestSha256:hash}).strict(),releaseManifest:z.string().max(16*1024*1024),label:z.string().min(1).max(80),notes:z.array(z.string().max(2000)).max(50),compatibility:z.object({profile:z.enum(['standard','lite']),variant,nodeMajor:z.literal(24),schema:z.literal('same-schema'),schemaFingerprint:hash}).strict(),changed:z.array(entry).max(100000),deletedFiles:z.array(path).max(100000),deletedDirectories:z.array(path).max(30000),fixture:z.boolean().optional()}).strict();
export type Delta=z.infer<typeof deltaSchema>;
export interface SignedDelta {body:string;signature:string;keyId:string}
export function parseRelease(bytes:string):UpdateRelease{
 const result=release.parse(JSON.parse(bytes));
 if(result.mechanismTest)throw Error('UPDATE_TEST_RELEASE_REJECTED');
 if(result.variant==='php-fpm'&&([...result.files,...result.directories].some(e=>e.path==='private'||e.path.startsWith('private/'))||result.files.some(e=>e.type==='symlink')))throw Error('UPDATE_PHP_PRIVATE_OR_LINK_FORBIDDEN');
 const seen=new Set<string>();
 for(const e of result.files){
  if(e.path==='release-manifest.json'||seen.has(e.path))throw Error('UPDATE_DUPLICATE_PATH');seen.add(e.path);
  if(e.type==='symlink'){
   const target=e.target;if(!target||target.startsWith('/')||target.includes('\\')||!safeReleasePath(posix.normalize(posix.join(posix.dirname(e.path),target)))||Buffer.byteLength(target)!==e.bytes||digest(target)!==e.sha256)throw Error('UPDATE_LINK_FORBIDDEN');
  }else if(e.target!==undefined||e.mode===0o777)throw Error('UPDATE_FILE_MODE');
 }
 const dirs=new Set<string>();for(const d of result.directories){if(dirs.has(d.path)||seen.has(d.path))throw Error('UPDATE_DUPLICATE_PATH');dirs.add(d.path);}
 for(const name of [...seen,...dirs]){let parent=posix.dirname(name);while(parent!=='.'){if(!dirs.has(parent))throw Error('UPDATE_PARENT_DIRECTORY_MISSING');parent=posix.dirname(parent);}}
 return result;
}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function difference(base:UpdateRelease,target:UpdateRelease){
 const old=new Map(base.files.map(e=>[e.path,e])),next=new Set(target.files.map(e=>e.path)),nextDirs=new Set(target.directories.map(e=>e.path));
 return {changed:target.files.filter(e=>!equal(e,old.get(e.path))),deletedFiles:base.files.filter(e=>!next.has(e.path)).map(e=>e.path).sort(),deletedDirectories:base.directories.filter(e=>!nextDirs.has(e.path)).map(e=>e.path).sort()};
}
/** Schema changes have no automatic restore/down path. Publishers must not declare them safe. */
export function schemaFingerprint(m:UpdateRelease){
 if(m.variant==='php-fpm'){
  if(!m.files.some(e=>e.path==='src/Database.php')||!m.files.some(e=>e.path.startsWith('migrations/')))throw Error('UPDATE_SCHEMA_IDENTITY_MISSING');
  return digest(JSON.stringify(m.files.filter(e=>e.path.startsWith('migrations/')||e.path==='src/Database.php').map(e=>[e.path,e.sha256]).sort((a,b)=>a[0]!.localeCompare(b[0]!))));
 }
 const required=m.profile==='lite'?'dist/server/src/lite/schema.js':'dist/server/src/server/db.js';
 if(!m.files.some(e=>e.path===required))throw Error('UPDATE_SCHEMA_IDENTITY_MISSING');
 return digest(JSON.stringify(m.files.filter(e=>e.path.startsWith('db/migrations/')||e.path===required).map(e=>[e.path,e.sha256]).sort((a,b)=>a[0]!.localeCompare(b[0]!))));
}
export function validateDelta(delta:Delta,baseBytes:string){
 const base=parseRelease(baseBytes),target=parseRelease(delta.releaseManifest);
 if(delta.base.revision!==base.revision||delta.base.manifestSha256!==digest(baseBytes))throw Error('UPDATE_BASE_MISMATCH');
 if(target.revision===base.revision)throw Error('UPDATE_REVISION_UNCHANGED');
 if(target.profile!==base.profile||target.variant!==base.variant||delta.compatibility.profile!==target.profile||delta.compatibility.variant!==target.variant)throw Error('UPDATE_PROFILE_OR_VARIANT_MISMATCH');
 if(schemaFingerprint(base)!==schemaFingerprint(target)||delta.compatibility.schemaFingerprint!==schemaFingerprint(base))throw Error('UPDATE_SCHEMA_CHANGE_REQUIRES_OPERATOR');
 const expected=difference(base,target);
 if(!equal(delta.changed,expected.changed)||!equal(delta.deletedFiles,expected.deletedFiles)||!equal(delta.deletedDirectories,expected.deletedDirectories))throw Error('UPDATE_DELTA_INVENTORY_MISMATCH');
 return {base,target,...expected};
}
export function signDelta(delta:Delta,keyId:string,privateKey:string):SignedDelta{
 if(createPrivateKey(privateKey).asymmetricKeyType!=='ed25519')throw Error('UPDATE_SIGNING_ALGORITHM_INVALID');
 const body=JSON.stringify(deltaSchema.parse(delta));return {body,signature:sign(null,Buffer.from(body),privateKey).toString('base64'),keyId};
}
export function authenticateSignedPayload(input:unknown,keys:Record<string,string>):unknown{
 const signed=z.object({body:z.string().max(20*1024*1024),signature:z.string().regex(/^[A-Za-z0-9+/]{86}==$/),keyId:z.string().min(1).max(80)}).strict().parse(input);
 if(!Object.hasOwn(keys,signed.keyId))throw Error('UPDATE_SIGNING_KEY_UNKNOWN');
 const key=createPublicKey(keys[signed.keyId]!);if(key.asymmetricKeyType!=='ed25519'||!verify(null,Buffer.from(signed.body),key,Buffer.from(signed.signature,'base64')))throw Error('UPDATE_SIGNATURE_INVALID');
 return JSON.parse(signed.body);
}
export function authenticateDelta(input:unknown,keys:Record<string,string>):Delta{return deltaSchema.parse(authenticateSignedPayload(input,keys));}
export function payloadPlan(delta:Delta,base:UpdateRelease){
 const old=new Map(base.files.map(e=>[e.path,e]));const blobs=new Map<string,number>();
 for(const e of delta.changed)if(e.type!=='symlink'&&(old.get(e.path)?.sha256!==e.sha256||old.get(e.path)?.bytes!==e.bytes))blobs.set(e.sha256,e.bytes);
 return {blobs,bytes:[...blobs.values()].reduce((a,b)=>a+b,0)};
}
