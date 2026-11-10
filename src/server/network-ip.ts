import {createHash,createHmac} from 'node:crypto';
import ipaddr from 'ipaddr.js';

/** Socket/proxy resolution happens in Fastify. This helper never reads a header. */
export function normalizeNetworkIP(input:string):string|null {
 if(typeof input!=='string'||!input||input.length>80||input!==input.trim())return null;
 if(!input.includes(':')&&!/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(input))return null;
 try{return ipaddr.process(input).toString().replace(/%[^%]+$/,'');}catch{return null;}
}

/** Stable within one site only. The original address is never persisted. */
export function networkIPIdentity(input:string,siteId:string,secret:string):string|null {
 const ip=normalizeNetworkIP(input);if(!ip||!siteId||!secret)return null;
 return 'v1:'+createHmac('sha256',secret).update(`baize:network-ip:v1\0${siteId}\0${ip}`).digest('hex');
}
export function validIPIdentity(value:unknown):value is string {return typeof value==='string'&&/^v1:[a-f0-9]{64}$/.test(value);}
export interface IPMetrics {ips:number|null;knownIps:number|null;ipCoverage:number;ipStatus:'complete'|'partial_ip_identity'|'not_collected'|'unsupported_in_this_mode'|'incomplete_data'}
export function summarizeIPIdentities(pageviews:number,knownPageviews:number,distinct:number,privacy=false):IPMetrics {
 if(privacy)return {ips:null,knownIps:null,ipCoverage:0,ipStatus:'unsupported_in_this_mode'};
 const complete=pageviews===knownPageviews;
 return {ips:complete?distinct:null,knownIps:distinct,ipCoverage:pageviews?knownPageviews/pageviews:1,ipStatus:complete?'complete':knownPageviews?'partial_ip_identity':'not_collected'};
}
export function countIPIdentities(events:ReadonlyArray<{type:string;dimensions:Record<string,string>}>,privacy=false):IPMetrics {
 let pages=0,known=0;const ids=new Set<string>();
 for(const event of events){if(event.type!=='pageview')continue;pages++;const id=event.dimensions.client_ip_id;if(validIPIdentity(id)){known++;ids.add(id);}}
 return summarizeIPIdentities(pages,known,ids.size,privacy);
}
/** The merged audience dictionary is an exact key union across the selected
 * buckets. Values are PV counts, so missing identity coverage remains visible. */
export function countIPAudience(pageviews:number,counts:Record<string,number>|undefined,privacy=false,available=true):IPMetrics {
 if(privacy)return summarizeIPIdentities(0,0,0,true);
 let known=0,distinct=0;
 for(const [identity,count] of Object.entries(counts||{})){if(!validIPIdentity(identity)||!Number.isSafeInteger(count)||count<=0)continue;known+=count;distinct++;}
 if(!available||!Number.isSafeInteger(pageviews)||pageviews<0||known>pageviews)return {ips:null,knownIps:null,ipCoverage:0,ipStatus:'incomplete_data'};
 return summarizeIPIdentities(pageviews,known,distinct);
}
export function publicIPKey(identity:unknown):string|null {return validIPIdentity(identity)?createHash('sha256').update('baize:network-display:v1\0'+identity).digest('hex').slice(0,24):null;}
/** A display label is not used for deduplication and is not a reversible IP. */
export function networkIPLabel(dimensions:Record<string,string>):string|null {
 const id=dimensions.client_ip_id;if(!validIPIdentity(id))return null;
 const prefix=dimensions.ip_truncated;return `${prefix&&prefix!=='unknown'?prefix:'IP'} · ${publicIPKey(id)!.slice(0,12)}`;
}

/** Response copies only: internal fact dimensions remain available for DISTINCT. */
export function stripInternalIPDimensions<T>(value:T):T {
 if(Array.isArray(value))return value.map(item=>stripInternalIPDimensions(item)) as T;
 if(!value||typeof value!=='object'||value instanceof Date)return value;
 return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='client_ip_id').map(([key,item])=>[key,stripInternalIPDimensions(item)])) as T;
}
