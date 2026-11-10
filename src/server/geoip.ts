import { createHash } from 'node:crypto';
import { mkdir,readFile,writeFile,rename,mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import maxmind,{ type CityResponse, type Reader } from 'maxmind';
import { safeFetch,type Transport } from './outbound.js';
import ipaddr from 'ipaddr.js';
import {XdbReader,parseIPRegion,unknownIPRegion,type IPRegion} from './ip2region.js';
import {openIP2Region} from './ip2region-snapshot.js';
const exec=promisify(execFile);
export type GeoProvider='ip2region'|'maxmind';
export class GeoIP {
 private reader:Reader<CityResponse>|null=null;
 private xdb:XdbReader[]=[];
 status:'ready'|'unknown'='unknown';
 provider:GeoProvider|null=null;
 disable(){this.reader=null;this.xdb=[];this.status='unknown';this.provider=null;}
 async open(dataDir:string,provider?:GeoProvider){
  if(provider!=='maxmind')try{const loaded=await openIP2Region(dataDir);this.xdb=loaded.readers;this.reader=null;this.provider='ip2region';this.status='ready';return;}catch{/* Optional snapshot may not be installed yet. */}
  if(provider!=='ip2region')try{const next=await maxmind.open<CityResponse>(join(dataDir,'GeoLite2-City.mmdb'));this.reader=next;this.xdb=[];this.provider='maxmind';this.status='ready';return;}catch{/* No compatible MaxMind file. */}
  this.disable();
 }
 lookup(ip:string):IPRegion {
  try{
   const address=ipaddr.process(ip);if(address.range()!=='unicast')return unknownIPRegion();
   if(this.provider==='ip2region'){const family=address.kind()==='ipv4'?4:6;return parseIPRegion(this.xdb.find(reader=>reader.family===family)?.search(address.toString())??null);}
   const result=this.reader?.get(address.toString());return {country:result?.country?.iso_code??'unknown',region:result?.subdivisions?.[0]?.names?.['zh-CN']??result?.subdivisions?.[0]?.names?.en??'unknown',city:result?.city?.names?.['zh-CN']??result?.city?.names?.en??'unknown',isp:'unknown'};
  }catch{return unknownIPRegion();}
 }
}
// MaxMind's official authenticated GeoIP database download API. Never save the license.
export async function downloadGeoIP(dataDir:string,accountId:string,licenseKey:string,transport:Transport=safeFetch):Promise<void>{
 if(!/^\d+$/.test(accountId)||!licenseKey)throw new Error('MaxMind account/license required');
 const headers={authorization:`Basic ${Buffer.from(`${accountId}:${licenseKey}`).toString('base64')}`};
 // Binary download preserves bytes; independent official checksum fetched with TLS verification.
 const base='https://download.maxmind.com/geoip/databases/GeoLite2-City/download';
 const checksum=await transport(`${base}?suffix=tar.gz.sha256`,{headers,maxBytes:10000,publicRedirectWithoutCredentials:true});
 if(checksum.status!==200)throw new Error('Official MaxMind checksum unavailable');
 const expected=checksum.text.trim().split(/\s+/)[0];if(!/^[a-f0-9]{64}$/i.test(expected??''))throw new Error('Invalid official checksum');
 // safeFetch binary field is deliberately optional; fallback must not convert archive through UTF-8.
 const archive=await transport(`${base}?suffix=tar.gz`,{headers,maxBytes:128*1024*1024,timeoutMs:60000,publicRedirectWithoutCredentials:true,binary:true});
 if(archive.status!==200||!archive.bytes)throw new Error('MaxMind archive unavailable');
 if(createHash('sha256').update(archive.bytes).digest('hex')!==expected?.toLowerCase())throw new Error('MaxMind checksum mismatch');
 await mkdir(dataDir,{recursive:true,mode:0o700});const temporary=await mkdtemp(join(dataDir,'geoip-download-'));try{const file=join(temporary,'db.tar.gz');await writeFile(file,archive.bytes,{mode:0o600});const listing=await exec('tar',['-tzf',file],{maxBuffer:2_000_000,timeout:30000});const names=listing.stdout.split('\n').filter(p=>p.endsWith('/GeoLite2-City.mmdb'));if(names.length!==1||names[0]!.split('/').some(p=>p==='..')||names[0]!.startsWith('/'))throw new Error('Unsafe MaxMind archive');const extracted=await exec('tar',['-xOzf',file,names[0]!],{encoding:'buffer',maxBuffer:128*1024*1024,timeout:30000});const target=join(temporary,'GeoLite2-City.mmdb');await writeFile(target,extracted.stdout,{mode:0o600});await maxmind.open<CityResponse>(target);await rename(target,join(dataDir,'GeoLite2-City.mmdb'));}finally{await rm(temporary,{recursive:true,force:true});}
}
export async function geoIPStatus(dataDir:string,provider?:GeoProvider){
 if(provider!=='maxmind')try{return (await openIP2Region(dataDir)).status;}catch{/* Optional offline snapshot. */}
 if(provider!=='ip2region')try{const path=join(dataDir,'GeoLite2-City.mmdb');await maxmind.open<CityResponse>(path);const bytes=await readFile(path);return {configured:true,provider:'maxmind' as const,checksum:createHash('sha256').update(bytes).digest('hex'),ipv4:true,ipv6:true,isp:false};}catch{/* Optional MaxMind database. */}
 return {configured:false,provider:provider??'ip2region',ipv4:false,ipv6:false,isp:false,warning:'请下载离线地域库；未识别的地域与运营商保留未知。'};
}
