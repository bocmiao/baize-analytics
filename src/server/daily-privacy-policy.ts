import {stableIdentityKey} from '../../packages/tracker/src/privacy.js';
/** Known identifiers only. Arbitrary free text is not guaranteed anonymous. */
export function sanitizeDailyValue(value:unknown):unknown{
 if(Array.isArray(value))return value.map(sanitizeDailyValue).filter(item=>item!==undefined);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!stableIdentityKey(key)).map(([key,v])=>[key,sanitizeDailyValue(v)]).filter(([,v])=>v!==undefined));
 if(typeof value==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))return undefined;
 return value;
}
export function sanitizeDailyPayload<T extends Record<string,unknown>>(payload:T,columns:{visitorId:string;pageId:string}):T{
 const out=sanitizeDailyValue(payload) as T;
 for(const key of ['visitor_id','page_id'] as const)if(Object.hasOwn(payload,key))Object.assign(out,{[key]:key==='visitor_id'?columns.visitorId:columns.pageId});
 return out;
}
export function sanitizeDailyDimensions<T extends Record<string,unknown>>(dimensions:T):T{
 const out=sanitizeDailyValue(dimensions) as T;
 if(['desktop','mobile','tablet','unknown'].includes(String(dimensions.device??'')))Object.assign(out,{device:dimensions.device});
 return out;
}
