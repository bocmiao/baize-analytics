import {readFileSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {safeAncestors} from '../release/preflight.js';
import {safeFetch,localModelOrigin} from '../server/outbound.js';
import {authenticateDelta,type Delta} from './protocol.js';
import {sourceAuthorization} from './source-auth.js';

export class UpdateSource {
 readonly base?:URL;
 constructor(readonly options:{url?:string;offlineDirectory?:string;keys:Record<string,string>;allowLocalFixture?:boolean;authorizationFile?:string}){
  if(!!options.url===!!options.offlineDirectory)throw Error('UPDATE_SOURCE_EXACTLY_ONE_REQUIRED');
  if(options.offlineDirectory){if(options.offlineDirectory!==resolve(options.offlineDirectory)||options.authorizationFile)throw Error('UPDATE_OFFLINE_CONFIG_INVALID');safeAncestors(options.offlineDirectory);return;}
  this.base=new URL(options.url!);
  if(this.base.username||this.base.password||this.base.search||this.base.hash||!this.base.pathname.endsWith('/'))throw Error('UPDATE_SOURCE_CONFIG_INVALID');
  if(options.allowLocalFixture){if(this.base.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(this.base.hostname)||!localModelOrigin(this.base.origin))throw Error('UPDATE_FIXTURE_MUST_BE_LOOPBACK');}
  else if(this.base.protocol!=='https:')throw Error('UPDATE_SOURCE_HTTPS_REQUIRED');
 }
 private async read(path:string,maxBytes:number){
  if(this.options.offlineDirectory){const root=this.options.offlineDirectory;safeAncestors(root);const directory=lstatSync(root);if(!directory.isDirectory()||directory.uid!==process.getuid!()||directory.mode&0o077)throw Error('UPDATE_OFFLINE_SOURCE_UNTRUSTED');const file=join(root,path);safeAncestors(file);const s=lstatSync(file);if(!s.isFile()||s.nlink!==1||s.uid!==process.getuid!()||s.mode&0o022||s.size>maxBytes)throw Error('UPDATE_OFFLINE_SOURCE_UNTRUSTED');return readFileSync(file);}
  const base=this.base!;const authorization=sourceAuthorization(this.options.authorizationFile);let result;try{result=await safeFetch(new URL(path,base).href,{binary:true,maxBytes,timeoutMs:120000,allowedOrigin:base.origin,...authorization?{headers:{authorization}}:{},...this.options.allowLocalFixture?{exactLocalOrigin:base.origin}:{}});}catch{throw Error('UPDATE_SOURCE_NETWORK_FAILED');}
  if(result.status!==200||!result.bytes)throw Error('UPDATE_SOURCE_DOWNLOAD_FAILED');return result.bytes;
 }
 async latest():Promise<{delta:Delta;metadataBytes:number;signedBytes:Buffer}>{
  const bytes=await this.read('latest.json',24*1024*1024);const delta=authenticateDelta(JSON.parse(bytes.toString()),this.options.keys);
  if(delta.fixture&&!this.options.allowLocalFixture)throw Error('UPDATE_FIXTURE_NOT_PRODUCTION_RELEASE');
  return {delta,metadataBytes:bytes.length,signedBytes:bytes};
 }
 async blob(hash:string,bytes:number){if(!/^[a-f0-9]{64}$/.test(hash)||!Number.isSafeInteger(bytes)||bytes<0||bytes>128*1024*1024)throw Error('UPDATE_BLOB_REQUEST_INVALID');return this.read('blobs/'+hash,bytes);}
}
