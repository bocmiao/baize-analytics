import {safeFetch,localModelOrigin} from '../server/outbound.js';
import {authenticateDelta,type Delta} from './protocol.js';
import {sourceAuthorization} from './source-auth.js';

export class UpdateSource {
 readonly base:URL;
 constructor(readonly options:{url:string;keys:Record<string,string>;allowLocalFixture?:boolean;authorizationFile?:string}){
  this.base=new URL(options.url);
  if(this.base.username||this.base.password||this.base.search||this.base.hash||!this.base.pathname.endsWith('/'))throw Error('UPDATE_SOURCE_CONFIG_INVALID');
  if(options.allowLocalFixture){if(this.base.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(this.base.hostname)||!localModelOrigin(this.base.origin))throw Error('UPDATE_FIXTURE_MUST_BE_LOOPBACK');}
  else if(this.base.protocol!=='https:')throw Error('UPDATE_SOURCE_HTTPS_REQUIRED');
 }
 private async read(path:string,maxBytes:number){
  const authorization=sourceAuthorization(this.options.authorizationFile);let result;try{result=await safeFetch(new URL(path,this.base).href,{binary:true,maxBytes,timeoutMs:120000,allowedOrigin:this.base.origin,...authorization?{headers:{authorization}}:{},...this.options.allowLocalFixture?{exactLocalOrigin:this.base.origin}:{}});}catch{throw Error('UPDATE_SOURCE_NETWORK_FAILED');}
  if(result.status!==200||!result.bytes)throw Error('UPDATE_SOURCE_DOWNLOAD_FAILED');return result.bytes;
 }
 async latest():Promise<{delta:Delta;metadataBytes:number;signedBytes:Buffer}>{
  const bytes=await this.read('latest.json',24*1024*1024);const delta=authenticateDelta(JSON.parse(bytes.toString()),this.options.keys);
  if(delta.fixture&&!this.options.allowLocalFixture)throw Error('UPDATE_FIXTURE_NOT_PRODUCTION_RELEASE');
  return {delta,metadataBytes:bytes.length,signedBytes:bytes};
 }
 async blob(hash:string,bytes:number){if(!/^[a-f0-9]{64}$/.test(hash)||!Number.isSafeInteger(bytes)||bytes<0||bytes>128*1024*1024)throw Error('UPDATE_BLOB_REQUEST_INVALID');return this.read('blobs/'+hash,bytes);}
}
