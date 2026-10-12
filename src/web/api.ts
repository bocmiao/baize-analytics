import {apiErrorMessage} from './errorMessages';
export class ApiError extends Error {
 constructor(message:string,readonly status:number,readonly code?:string){super(message);this.name='ApiError';}
}
export function safeWorkspaceReturn(value:string|null,origin:string):string {
 if(!value||value.length>8192||!value.startsWith('/')||value.startsWith('//')||value.includes('\\'))return '/app';
 try{const target=new URL(value,origin);return target.origin===origin&&target.pathname==='/app'?target.pathname+target.search:'/app';}catch{return '/app';}
}
export async function api<T = Record<string, unknown>>(path:string, body?:unknown, method=body === undefined?'GET':'POST', signal?:AbortSignal):Promise<T> {
 const response=await fetch(path,{method,signal,credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const result=await response.json().catch(()=>({error:`HTTP ${response.status}`}));
 if(!response.ok){
  const error=new ApiError(apiErrorMessage(result,response.status),response.status,typeof result.code==='string'?result.code:undefined);
  if(response.status===401&&typeof window!=='undefined'&&window.location.pathname==='/app')window.dispatchEvent(new Event('baize:session-required'));
  throw error;
 }
 return result as T;
}
export type Row = Record<string, unknown>;
export type Site = {id:string;name:string;domain:string;timezone:string;privacy_mode:string;retention_days?:number;tags?:string[];config?:Row;current_role?:string};
export function rows(value:unknown):Row[] {if(Array.isArray(value))return value as Row[];if(value&&typeof value==='object'){const v=value as Row;for(const key of ['rows','data','items','sites','results'])if(Array.isArray(v[key]))return v[key] as Row[];}return [];}
