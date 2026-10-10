import {createHash} from 'node:crypto';
/** Canonical storage sorts object keys; array order remains part of replay identity. */
export function replayPayloadHash(value:unknown):string{
 const stable=(v:unknown):unknown=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)])):v;
 return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
