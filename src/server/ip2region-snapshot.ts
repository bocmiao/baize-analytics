import {createHash,randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {safeFetch,type Transport} from './outbound.js';
import {XdbReader} from './ip2region.js';

/** Versioned upstream snapshot. Updating it requires checking the original Git
 * blob identities, SHA-256, XDB format and lookup regression suite together. */
export const ip2regionSnapshot={
 provider:'ip2region',revision:'d003e9ea1cbce169488cea7d7de3ac6d6fd00249',license:'Apache-2.0 OR MIT',
 source:'https://github.com/lionsoul2014/ip2region',
 files:[
  {name:'ip2region_v4.xdb',path:'data/ip2region_v4.xdb',family:4 as const,bytes:11122742,sha256:'a12ad5aca1277d67e525efcda531a20cc0d654ff4f087150d45bc17fca4bc260',gitBlob:'3e2eb3568a704401325a0afa51d4759ab665a5ec'},
  {name:'ip2region_v6.xdb',path:'data/ip2region_v6.xdb',family:6 as const,bytes:37277813,sha256:'939f6b46bd2b8bec3cf7c5ceb8ba782266ae9b1f35b5ba7916700dec0b7506ed',gitBlob:'15002d535f31336cc556b672a617186c827ea14c'},
 ],
 licenseFile:{name:'LICENSE.ip2region.md',path:'LICENSE.md',bytes:12976,sha256:'fe01f2f8fcaafac539154e6aa80b0b7f8af54e01dc4d52322f72971991c6280e',gitBlob:'82c2274323688510d87cfdfcf30c38eb6ce2d9b1'},
} as const;
export type XdbStatus={configured:true;provider:'ip2region';revision:string;installedAt:string;license:string;ipv4:true;ipv6:true;isp:true;files:{name:string;sha256:string;bytes:number;builtAt:string}[]};
export function verifySnapshotFile(bytes:Buffer,file:{bytes:number;sha256:string;gitBlob:string}){
 if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256||createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')!==file.gitBlob)throw Error('IP2Region snapshot checksum mismatch');
}
async function readVersion(directory:string){
 const files=[] as XdbStatus['files'],readers=[] as XdbReader[];
 for(const expected of ip2regionSnapshot.files){const bytes=await readFile(join(directory,expected.name));verifySnapshotFile(bytes,expected);const reader=new XdbReader(bytes,expected.family);readers.push(reader);files.push({name:expected.name,sha256:expected.sha256,bytes:bytes.length,builtAt:reader.builtAt});}
 verifySnapshotFile(await readFile(join(directory,ip2regionSnapshot.licenseFile.name)),ip2regionSnapshot.licenseFile);
 return {files,readers};
}
export async function openIP2Region(dataDir:string){
 const base=join(dataDir,'geoip','ip2region'),current=JSON.parse(await readFile(join(base,'current.json'),'utf8')) as {revision?:string;installedAt?:string};
 if(current.revision!==ip2regionSnapshot.revision||!current.installedAt||!Number.isFinite(Date.parse(current.installedAt)))throw Error('Unsupported IP2Region snapshot pointer');
 const loaded=await readVersion(join(base,current.revision));
 const status:XdbStatus={configured:true,provider:'ip2region',revision:current.revision,installedAt:current.installedAt,license:ip2regionSnapshot.license,ipv4:true,ipv6:true,isp:true,files:loaded.files};
 return {...loaded,status};
}
/** Download or import a fixed official snapshot, validate both families before
 * atomically switching the current pointer. Existing readers stay usable. */
export async function installIP2Region(dataDir:string,options:{transport?:Transport;fromDirectory?:string}={}){
 const base=join(dataDir,'geoip','ip2region');await mkdir(base,{recursive:true,mode:0o700});
 const temporary=await mkdtemp(join(base,'download-'));
 try{
  for(const file of [...ip2regionSnapshot.files,ip2regionSnapshot.licenseFile]){
   let bytes:Buffer;
   if(options.fromDirectory)bytes=await readFile(join(options.fromDirectory,file.name));
   else {const response=await (options.transport??safeFetch)(`https://raw.githubusercontent.com/lionsoul2014/ip2region/${ip2regionSnapshot.revision}/${file.path}`,{binary:true,maxBytes:file.bytes+1,timeoutMs:120000,allowedOrigin:'https://raw.githubusercontent.com'});if(response.status!==200||!response.bytes)throw Error('IP2Region official download unavailable');bytes=response.bytes;}
   verifySnapshotFile(bytes,file);await writeFile(join(temporary,file.name),bytes,{mode:0o600});
  }
  await readVersion(temporary);
  const target=join(base,ip2regionSnapshot.revision);
  try{await rename(temporary,target);}catch(error){
   if(!['EEXIST','ENOTEMPTY','EPERM'].includes((error as NodeJS.ErrnoException).code||''))throw error;
   // Idempotent installs may reuse only the identical, validated snapshot.
   await readVersion(target);
  }
  const pointer=join(base,`current-${randomBytes(8).toString('hex')}.json`);
  await writeFile(pointer,JSON.stringify({revision:ip2regionSnapshot.revision,installedAt:new Date().toISOString()})+'\n',{mode:0o600});
  try{await rename(pointer,join(base,'current.json'));}finally{await rm(pointer,{force:true});}
  return (await openIP2Region(dataDir)).status;
 }finally{await rm(temporary,{recursive:true,force:true});}
}
