import { createHash } from 'node:crypto';
import { mkdir,readFile,writeFile,rename,mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import maxmind,{ type CityResponse, type Reader } from 'maxmind';
import { safeFetch } from './outbound.js';
const exec=promisify(execFile);
export class GeoIP {
 private reader:Reader<CityResponse>|null=null;
 status:'ready'|'unknown'='unknown';
 async open(dataDir:string){try{this.reader=await maxmind.open<CityResponse>(join(dataDir,'GeoLite2-City.mmdb'));this.status='ready';}catch{this.reader=null;this.status='unknown';}}
 lookup(ip:string):{country:string;region:string;city:string}{const result=this.reader?.get(ip);return {country:result?.country?.iso_code??'unknown',region:result?.subdivisions?.[0]?.names?.['zh-CN']??result?.subdivisions?.[0]?.names?.en??'unknown',city:result?.city?.names?.['zh-CN']??result?.city?.names?.en??'unknown'};}
}
// MaxMind's official authenticated GeoIP database download API. Never save the license.
export async function downloadGeoIP(dataDir:string,accountId:string,licenseKey:string):Promise<void>{
 if(!/^\d+$/.test(accountId)||!licenseKey)throw new Error('MaxMind account/license required');
 const headers={authorization:`Basic ${Buffer.from(`${accountId}:${licenseKey}`).toString('base64')}`};
 // Binary download preserves bytes; independent official checksum fetched with TLS verification.
 const base='https://download.maxmind.com/geoip/databases/GeoLite2-City/download';
 const checksum=await safeFetch(`${base}?suffix=tar.gz.sha256`,{headers,maxBytes:10000,publicRedirectWithoutCredentials:true});
 if(checksum.status!==200)throw new Error('Official MaxMind checksum unavailable');
 const expected=checksum.text.trim().split(/\s+/)[0];if(!/^[a-f0-9]{64}$/i.test(expected??''))throw new Error('Invalid official checksum');
 // safeFetch binary field is deliberately optional; fallback must not convert archive through UTF-8.
 const archive=await safeFetch(`${base}?suffix=tar.gz`,{headers,maxBytes:128*1024*1024,timeoutMs:60000,publicRedirectWithoutCredentials:true});
 if(archive.status!==200||!archive.bytes)throw new Error('MaxMind archive unavailable');
 if(createHash('sha256').update(archive.bytes).digest('hex')!==expected?.toLowerCase())throw new Error('MaxMind checksum mismatch');
 await mkdir(dataDir,{recursive:true,mode:0o700});const temporary=await mkdtemp(join(dataDir,'geoip-download-'));try{const file=join(temporary,'db.tar.gz');await writeFile(file,archive.bytes,{mode:0o600});const listing=await exec('tar',['-tzf',file],{maxBuffer:2_000_000});const names=listing.stdout.split('\n').filter(p=>p.endsWith('/GeoLite2-City.mmdb'));if(names.length!==1||names[0]!.split('/').some(p=>p==='..')||names[0]!.startsWith('/'))throw new Error('Unsafe MaxMind archive');const extracted=await exec('tar',['-xOzf',file,names[0]!],{encoding:'buffer',maxBuffer:128*1024*1024});const target=join(temporary,'GeoLite2-City.mmdb');await writeFile(target,extracted.stdout,{mode:0o600});await maxmind.open<CityResponse>(target);await rename(target,join(dataDir,'GeoLite2-City.mmdb'));}finally{await rm(temporary,{recursive:true,force:true});}
}
export async function geoIPStatus(dataDir:string){try{const bytes=await readFile(join(dataDir,'GeoLite2-City.mmdb'));return {configured:true,checksum:createHash('sha256').update(bytes).digest('hex')};}catch{return {configured:false,warning:'地域为 unknown。配置 MAXMIND_ACCOUNT_ID 和 MAXMIND_LICENSE_KEY 后下载官方数据库并验证 SHA256。'};}}
