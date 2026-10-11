import {ExternalError} from './external-errors.js';
/** Provider text is never attached to errors or returned to the caller. */
export function providerRows(text:string,pageLimit:number):Record<string,unknown>[] {
 let value:unknown;try{value=JSON.parse(text);}catch{throw new ExternalError('external_response_invalid');}
 if(!value||typeof value!=='object'||Array.isArray(value))throw new ExternalError('external_response_invalid');
 const rows=(value as Record<string,unknown>).rows;
 if(rows===undefined)return [];
 if(!Array.isArray(rows)||rows.length>pageLimit||rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw new ExternalError('external_response_invalid');
 return rows as Record<string,unknown>[];
}
