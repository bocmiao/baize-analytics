import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ipaddr from 'ipaddr.js';
import {XdbReader,parseIPRegion,unknownIPRegion} from '../../src/server/ip2region.js';
import {GeoIP} from '../../src/server/geoip.js';
import {installIP2Region,verifySnapshotFile,ip2regionSnapshot} from '../../src/server/ip2region-snapshot.js';
import manifest from '../../packages/ip2region-data/manifest.json';

/** Explicit synthetic XDB fixture. Region names are not production lookup data. */
function fixture(family:4|6,record='中国|测试省|测试市|测试运营商|CN'){
 const start=256+256*256*8,addressBytes=family===4?4:16,entryBytes=addressBytes*2+6,text=Buffer.from(record),index=start+text.length;
 const data=Buffer.alloc(index+entryBytes);data.writeUInt16LE(3,0);data.writeUInt32LE(1762646400,4);data.writeUInt32LE(index,8);data.writeUInt32LE(index,12);data.writeUInt16LE(family,16);data.writeUInt16LE(4,18);text.copy(data,start);
 const first=Buffer.from(ipaddr.parse(family===4?'1.0.1.0':'2400:3200::').toByteArray()),last=Buffer.from(first);last[last.length-1]=255;
 const vector=256+(first[0]!*256+first[1]!)*8;data.writeUInt32LE(index,vector);data.writeUInt32LE(index,vector+4);
 (family===4?first.reverse():first).copy(data,index);(family===4?last.reverse():last).copy(data,index+addressBytes);data.writeUInt16LE(text.length,index+addressBytes*2);data.writeUInt32LE(start,index+addressBytes*2+2);
 return data;
}
it('reads both XDB address families and IPv4-mapped IPv6 without confusing byte order',()=>{
 const v4=new XdbReader(fixture(4),4),v6=new XdbReader(fixture(6),6);
 expect(parseIPRegion(v4.search('1.0.1.1'))).toEqual({country:'CN',region:'测试省',city:'测试市',isp:'测试运营商'});
 expect(v4.search('::ffff:1.0.1.2')).toBe(v4.search('1.0.1.2'));
 expect(parseIPRegion(v6.search('2400:3200::1')).country).toBe('CN');
 expect(v4.search('1.0.2.1')).toBeNull();expect(v6.search('2600::1')).toBeNull();expect(v4.search('2400:3200::1')).toBeNull();
});
it('leaves invalid, private, loopback and unmapped data unknown',()=>{
 const reader=new XdbReader(fixture(4));
 for(const ip of ['','1.0.1.1oops','10.1.1.1','127.0.0.1','192.0.2.1','::1'])expect(reader.search(ip)).toBeNull();
 expect(parseIPRegion('United States|0|0|0|US')).toEqual({country:'US',region:'unknown',city:'unknown',isp:'unknown'});
 expect(parseIPRegion('unexpected|fields')).toEqual(unknownIPRegion());
});
it('rejects truncated files, wrong address families and corrupt record pointers',()=>{
 expect(()=>new XdbReader(Buffer.alloc(100))).toThrow('length');expect(()=>new XdbReader(fixture(4),6)).toThrow('format');
 const vector=fixture(4);vector.writeUInt32LE(1,256+256*8);expect(()=>new XdbReader(vector).search('1.0.1.1')).toThrow('vector bounds');
 const record=fixture(4),start=record.readUInt32LE(8);record.writeUInt32LE(record.length+1,start+10);expect(()=>new XdbReader(record).search('1.0.1.1')).toThrow('record bounds');
});
it('binds published provenance and rejects checksum-shaped but different bytes',()=>{
 expect(manifest).toEqual(ip2regionSnapshot);
 expect(()=>verifySnapshotFile(Buffer.alloc(4),ip2regionSnapshot.files[0])).toThrow('checksum');
});
it('does not replace the active pointer or leave temporary files after a bad download',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'baize-xdb-'));
 try{
  const base=join(directory,'geoip','ip2region');await mkdir(base,{recursive:true});await writeFile(join(base,'current.json'),'existing active snapshot');
  await expect(installIP2Region(directory,{transport:async(url,options)=>{expect(url).toContain('/'+ip2regionSnapshot.revision+'/data/ip2region_v4.xdb');expect(options?.allowedOrigin).toBe('https://raw.githubusercontent.com');return {status:200,text:'',headers:{},bytes:Buffer.from('corrupt snapshot')};}})).rejects.toThrow('checksum');
  expect(await readFile(join(base,'current.json'),'utf8')).toBe('existing active snapshot');
 }finally{await rm(directory,{recursive:true,force:true});}
});
it('falls back to unknown when the selected provider is missing or disabled',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'baize-geo-'));
 try{const geo=new GeoIP();await geo.open(directory,'ip2region');expect(geo.status).toBe('unknown');expect(geo.lookup('1.0.1.1')).toEqual(unknownIPRegion());geo.disable();expect(geo.provider).toBeNull();}finally{await rm(directory,{recursive:true,force:true});}
});
