import {apiErrorMessage,localizedErrorCode} from './errorMessages';
import {invalidateReportReads,reportReadCache} from './reportReadCache';
export {invalidateReportReads} from './reportReadCache';
export class ApiError extends Error {
 constructor(message:string,readonly status:number,readonly code?:string){super(message);this.name='ApiError';}
}
export type ApiReadMetadata={coverage?:number;status?:string;method?:string;evidenceFrom?:string;watermark?:string;truncated?:boolean};
const readMetadata=new WeakMap<object,ApiReadMetadata>();
export function apiReadMetadata(value:unknown):ApiReadMetadata|undefined{return value!==null&&typeof value==='object'?readMetadata.get(value):undefined;}
export function peekReport<T=Record<string,unknown>>(path:string):T|undefined{return reportReadCache.peek<T>(path);}
export function readReport<T=Record<string,unknown>>(path:string,signal?:AbortSignal,options:{force?:boolean;refreshKey?:number|string}={}):Promise<T>{
 return reportReadCache.read(path,sharedSignal=>api<T>(path,undefined,'GET',sharedSignal),{...options,signal});
}
export function safeWorkspaceReturn(value:string|null,origin:string):string {
 if(!value||value.length>8192||!value.startsWith('/')||value.startsWith('//')||value.includes('\\'))return '/app';
 try{const target=new URL(value,origin);return target.origin===origin&&target.pathname==='/app'?target.pathname+target.search:'/app';}catch{return '/app';}
}
export async function api<T = Record<string, unknown>>(path:string, body?:unknown, method=body === undefined?'GET':'POST', signal?:AbortSignal):Promise<T> {
 const readOnly=['GET','HEAD','OPTIONS'].includes(method.toUpperCase()),sessionRevision=reportReadCache.sessionRevision;
 const response=await fetch(path,{method,signal,credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 if(signal?.aborted)throw new DOMException('The request was cancelled.','AbortError');
 if(response.status===401){invalidateReportReads('session');if(typeof window!=='undefined'&&window.location.pathname==='/app')window.dispatchEvent(new Event('baize:session-required'));}
 const invalidateWrite=()=>{if(!readOnly)invalidateReportReads(path==='/api/logout'?'session':'mutation');};
 const ensureCurrentSession=()=>{if(signal?.aborted||readOnly&&sessionRevision!==reportReadCache.sessionRevision)throw new DOMException('The request was cancelled.','AbortError');};
 if(response.status===204||response.status===205){ensureCurrentSession();invalidateWrite();return undefined as T;}
 let result:unknown;try{result=await response.json();}catch(error){if(error instanceof Error&&error.name==='AbortError')throw error;throw new ApiError(localizedErrorCode('invalid_api_response',response.status),response.status,'invalid_api_response');}
 if(!result||typeof result!=='object')throw new ApiError(localizedErrorCode('invalid_api_response',response.status),response.status,'invalid_api_response');
 const errorBody=result as Record<string,unknown>;
 if(!response.ok||typeof errorBody.error==='string'){
  const error=new ApiError(apiErrorMessage(errorBody,response.status),response.status,typeof errorBody.code==='string'?errorBody.code:undefined);
  throw error;
 }
 ensureCurrentSession();
 invalidateWrite();
 if(path==='/api/me'||path==='/api/login'||path==='/api/setup'){
  const user=errorBody.user;
  if(user&&typeof user==='object'&&'id' in user&&typeof user.id==='string')reportReadCache.identify(user.id);
 }
 const coverage=response.headers.get('X-Baize-Read-Coverage'),status=response.headers.get('X-Baize-Read-Status'),truncated=response.headers.get('X-Baize-Truncated');
 if(coverage!==null||status!==null||truncated!==null){const parsed=coverage===null?NaN:Number(coverage);readMetadata.set(result,{...(Number.isFinite(parsed)&&parsed>=0&&parsed<=1?{coverage:parsed}:{}),...(status?{status:status.slice(0,200)}:{}),...(truncated==='true'||truncated==='false'?{truncated:truncated==='true'}:{}),...Object.fromEntries([['method','X-Baize-Read-Method'],['evidenceFrom','X-Baize-Evidence-From'],['watermark','X-Baize-Watermark']].flatMap(([key,header])=>{const value=response.headers.get(header!);return value?[[key!,value.slice(0,200)]]:[];}))});}
 return result as T;
}
export type Row = Record<string, unknown>;
export function requireUserResponse(value:unknown):Row {const body=value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};const user=body.user&&typeof body.user==='object'&&!Array.isArray(body.user)?body.user as Row:null;if(!user||typeof user.id!=='string'||user.id===''||typeof user.email!=='string'||typeof user.name!=='string'||typeof user.is_admin!=='boolean')throw new ApiError(localizedErrorCode('invalid_api_response',200),200,'invalid_api_response');return user;}
export type Site = {id:string;name:string;domain:string;timezone:string;privacy_mode:string;retention_days?:number;tags?:string[];config?:Row;current_role?:string};
export function rows(value:unknown):Row[] {if(Array.isArray(value))return value as Row[];if(value&&typeof value==='object'){const v=value as Row;for(const key of ['rows','data','items','sites','results'])if(Array.isArray(v[key]))return v[key] as Row[];}return [];}
