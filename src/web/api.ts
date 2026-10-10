export async function api<T = Record<string, unknown>>(path:string, body?:unknown, method=body === undefined?'GET':'POST'):Promise<T> {
 const response=await fetch(path,{method,credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const result=await response.json().catch(()=>({error:`HTTP ${response.status}`}));
 if(!response.ok) throw new Error(`HTTP ${response.status}: ${result.message||result.error||'请求失败'}`);
 return result as T;
}
export type Row = Record<string, unknown>;
export type Site = {id:string;name:string;domain:string;timezone:string;privacy_mode:string;retention_days?:number};
export function rows(value:unknown):Row[] {if(Array.isArray(value))return value as Row[];if(value&&typeof value==='object'){const v=value as Row;for(const key of ['rows','data','items','sites','results'])if(Array.isArray(v[key]))return v[key] as Row[];}return [];}
