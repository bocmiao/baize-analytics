import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {matchesIPFilter} from './ip-filter.js';
import ipaddr from 'ipaddr.js';
const scrypt=promisify(scryptCallback);
export class HttpError extends Error { constructor(public statusCode:number,message:string){super(message);} }
export const hashToken=(value:string)=>createHash('sha256').update(value).digest('hex');
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64) as Buffer;return `scrypt:${salt}:${key.toString('hex')}`;}
export async function checkPassword(password:string,hash:string){const [type,salt,hex]=hash.split(':');if(type!=='scrypt'||!salt||!hex)return false;const key=await scrypt(password,salt,64) as Buffer;const stored=Buffer.from(hex,'hex');return stored.length===key.length&&timingSafeEqual(stored,key);}
export async function masterKey(path:string){
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  try {const file=await open(path,'wx',0o600);try{await file.writeFile(randomBytes(32));await file.sync();}finally{await file.close();}}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
  const data=await readFile(path);if(data.length===32)return data;
  const decoded=Buffer.from(data.toString().trim(),'hex');if(decoded.length!==32)throw new Error('Master key must be 32 raw bytes or 64 hex characters');return decoded;
}
export function anonymizeIP(ip:string){try{const parsed=ipaddr.process(ip);if(parsed.kind()==='ipv4'){const bytes=parsed.toByteArray();bytes[3]=0;return bytes.join('.');}const bytes=parsed.toByteArray();bytes.fill(0,8);return ipaddr.fromByteArray(bytes).toString();}catch{return null;}}
export function matchesCIDR(ip:string,cidr:string){return matchesIPFilter(ip,cidr);}
export function visitorHash(secret:string,day:string,ip:string,ua:string){return createHmac('sha256',secret).update(`${day}\0${ip}\0${ua}`).digest('hex');}
export function dayScopedPageId(secret:string,day:string,pageId:string){const hex=visitorHash(secret,day,'page',pageId).slice(0,32).split('');hex[12]='8';hex[16]=((parseInt(hex[16]!,16)&3)|8).toString(16);const value=hex.join('');return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;}
export function canonical(value:unknown):string {if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;if(value&&typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;return JSON.stringify(value);}
