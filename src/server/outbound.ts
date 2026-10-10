import type { LookupFunction } from 'node:net';
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import ipaddr from 'ipaddr.js';
export interface OutboundOptions { method?: string; headers?: Record<string,string>; body?: string; maxBytes?: number; timeoutMs?: number; exactLocalOrigin?: string; allowedOrigin?: string; publicRedirectWithoutCredentials?: boolean; }
export function publicAddress(address:string): boolean {
  try { const ip=ipaddr.process(address); return ip.range()==='unicast'; } catch { return false; }
}
export function localModelOrigin(origin:string):boolean{try{const url=new URL(origin);const host=url.hostname.replace(/^\[|\]$/g,'');if(host==='localhost')return true;const address=ipaddr.process(host);return ['loopback','private','uniqueLocal'].includes(address.range());}catch{return false;}}
export async function safeFetch(input:string, options:OutboundOptions={}, redirects=0):Promise<{status:number;headers:Record<string,string|string[]|undefined>;text:string;bytes?:Buffer}> {
  const url=new URL(input);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password) throw new Error('Unsafe URL');
  if(options.allowedOrigin&&url.origin!==options.allowedOrigin)throw new Error('Cross-origin redirect blocked');
  const local=options.exactLocalOrigin===url.origin;
  if(local&&!localModelOrigin(url.origin))throw new Error('Local model requires literal private IP or localhost; metadata/link-local blocked');
  if(!local&&url.protocol!=='https:') throw new Error('HTTPS required');
  let dnsTimer:ReturnType<typeof setTimeout>|undefined;
  const addresses=await Promise.race([lookup(url.hostname.replace(/^\[|\]$/g,''),{all:true}),new Promise<never>((_resolve,reject)=>{dnsTimer=setTimeout(()=>reject(new Error('DNS timeout')),Math.min(options.timeoutMs??10000,5000));})]).finally(()=>clearTimeout(dnsTimer));
  if(local&&addresses.some(a=>!['loopback','private','uniqueLocal'].includes(ipaddr.process(a.address).range())))throw new Error('Local destination changed to unsafe range');
  if(!addresses.length||(!local&&addresses.some(a=>!publicAddress(a.address)))) throw new Error('Private destination blocked');
  const pinned=addresses[0]!;
  const pinnedLookup:LookupFunction=(_host,opts,cb)=>opts.all?cb(null,[pinned]):cb(null,pinned.address,pinned.family);
  const result=await new Promise<{status:number;headers:Record<string,string|string[]|undefined>;text:string;bytes?:Buffer}>((resolve,reject)=>{
    const request=(url.protocol==='https:'?httpsRequest:httpRequest)(url,{method:options.method??'GET',headers:options.headers,lookup:pinnedLookup,agent:false},response=>{
      let size=0; const chunks:Buffer[]=[];
      response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>(options.maxBytes??2_000_000))request.destroy(new Error('Response too large'));else chunks.push(chunk);});
      response.on('end',()=>{clearTimeout(deadline);resolve({status:response.statusCode??0,headers:response.headers,text:Buffer.concat(chunks).toString('utf8'),bytes:Buffer.concat(chunks)});});
      response.on('error',reject);
    });
    const deadline=setTimeout(()=>request.destroy(new Error('Outbound timeout')),options.timeoutMs??10_000);request.setTimeout(options.timeoutMs??10_000,()=>request.destroy(new Error('Outbound timeout')));request.on('error',error=>{clearTimeout(deadline);reject(error);});request.end(options.body);
  });
  if([301,302,303,307,308].includes(result.status)&&result.headers.location){
    if(redirects>=3)throw new Error('Too many redirects');
    const next=new URL(String(result.headers.location),url);
    if(next.origin!==url.origin&&options.headers?.authorization){if(!options.publicRedirectWithoutCredentials)throw new Error('Credential redirect blocked');const headers={...options.headers};delete headers.authorization;return safeFetch(next.href,{...options,headers},redirects+1);}
    return safeFetch(next.href,options,redirects+1);
  }
  return result;
}
export type Transport=typeof safeFetch;
