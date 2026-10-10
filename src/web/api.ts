import {apiErrorMessage} from './errorMessages';
export async function api<T = Record<string, unknown>>(path:string, body?:unknown, method=body === undefined?'GET':'POST', signal?:AbortSignal):Promise<T> {
 const response=await fetch(path,{method,signal,credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const result=await response.json().catch(()=>({error:`HTTP ${response.status}`}));
 if(!response.ok) throw new Error(apiErrorMessage(result,response.status));
 return result as T;
}
export type Row = Record<string, unknown>;
export type Site = {id:string;name:string;domain:string;timezone:string;privacy_mode:string;retention_days?:number;tags?:string[];config?:Row;current_role?:string};
export function rows(value:unknown):Row[] {if(Array.isArray(value))return value as Row[];if(value&&typeof value==='object'){const v=value as Row;for(const key of ['rows','data','items','sites','results'])if(Array.isArray(v[key]))return v[key] as Row[];}return [];}
