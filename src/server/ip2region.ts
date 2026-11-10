// XDB layout and search procedure: ip2region, Copyright 2022 The Ip2Region Authors.
// TypeScript adaptation with strict IP parsing, bounds validation and synchronous
// in-memory reads. Upstream license and pinned provenance: packages/ip2region-data/.
import ipaddr from 'ipaddr.js';

export type IPRegion={country:string;region:string;city:string;isp:string};
export const unknownIPRegion=():IPRegion=>({country:'unknown',region:'unknown',city:'unknown',isp:'unknown'});
const headerBytes=256,vectorBytes=256*256*8;
export class XdbReader {
 readonly family:4|6;
 readonly builtAt:string;
 private readonly addressBytes:number;
 private readonly entryBytes:number;
 private readonly start:number;
 private readonly end:number;
 constructor(private readonly data:Buffer,expectedFamily?:4|6){
  if(data.length<headerBytes+vectorBytes)throw Error('Invalid XDB length');
  const structure=data.readUInt16LE(0),family=structure===2?4:data.readUInt16LE(16),pointerBytes=structure===2?4:data.readUInt16LE(18);
  if(![2,3].includes(structure)||![4,6].includes(family)||pointerBytes!==4||expectedFamily&&family!==expectedFamily)throw Error('Unsupported XDB format');
  this.family=family as 4|6;this.addressBytes=family===4?4:16;this.entryBytes=this.addressBytes*2+6;
  this.start=data.readUInt32LE(8);this.end=data.readUInt32LE(12);
  if(this.start<headerBytes+vectorBytes||this.end<this.start||this.end+this.entryBytes>data.length||(this.end-this.start)%this.entryBytes!==0)throw Error('Invalid XDB index bounds');
  this.builtAt=new Date(data.readUInt32LE(4)*1000).toISOString();
 }
 search(address:string):string|null {
  let parsed:ipaddr.IPv4|ipaddr.IPv6;
  try{parsed=ipaddr.process(address);}catch{return null;}
  if(parsed.range()!=='unicast'||(parsed.kind()==='ipv4'?4:6)!==this.family)return null;
  const bytes=Buffer.from(parsed.toByteArray()),vector=headerBytes+(bytes[0]!*256+bytes[1]!)*8;
  const start=this.data.readUInt32LE(vector),end=this.data.readUInt32LE(vector+4);
  if(start===0&&end===0)return null;
  if(start<this.start||end>this.end||end<start||(start-this.start)%this.entryBytes||(end-start)%this.entryBytes)throw Error('Invalid XDB vector bounds');
  let left=0,right=(end-start)/this.entryBytes;
  while(left<=right){
   const mid=Math.floor((left+right)/2),offset=start+mid*this.entryBytes;
   if(this.compare(bytes,offset)<0)right=mid-1;
   else if(this.compare(bytes,offset+this.addressBytes)>0)left=mid+1;
   else {
    const length=this.data.readUInt16LE(offset+this.addressBytes*2),pointer=this.data.readUInt32LE(offset+this.addressBytes*2+2);
    if(!length)return null;
    if(pointer<headerBytes+vectorBytes||pointer+length>this.start)throw Error('Invalid XDB record bounds');
    return new TextDecoder('utf-8',{fatal:true}).decode(this.data.subarray(pointer,pointer+length));
   }
  }
  return null;
 }
 private compare(ip:Buffer,offset:number){
  for(let i=0;i<this.addressBytes;i++){
   const difference=ip[i]!-this.data[offset+(this.family===4?this.addressBytes-i-1:i)]!;
   if(difference)return difference;
  }
  return 0;
 }
}
export function parseIPRegion(record:string|null):IPRegion {
 if(!record)return unknownIPRegion();
 const fields=record.split('|');if(fields.length!==5)return unknownIPRegion();
 const known=(value:string|undefined)=>value&&value!=='0'&&value!=='-'?value:'unknown';
 return {country:/^[A-Za-z]{2}$/.test(fields[4]||'')?fields[4]!.toUpperCase():'unknown',region:known(fields[1]),city:known(fields[2]),isp:known(fields[3])};
}
