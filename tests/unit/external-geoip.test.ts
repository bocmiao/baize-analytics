import { describe,it,expect } from 'vitest';
import { mkdtemp,mkdir,writeFile,readFile,rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import { GeoIP,downloadGeoIP,geoIPStatus } from '../../src/server/geoip.js';
import type { Transport } from '../../src/server/outbound.js';
const exec=promisify(execFile);
describe('GeoIP official download verification with explicitly invalid local artifact fixtures',()=>{
 it('unknown remains unknown without a valid mmdb; never fabricates a region',async()=>{const geo=new GeoIP();await geo.open('/tmp/definitely-missing-baize-mmdb');expect(geo.status).toBe('unknown');expect(geo.lookup('8.8.8.8')).toEqual({country:'unknown',region:'unknown',city:'unknown',isp:'unknown'});geo.disable();expect(geo.status).toBe('unknown');});
 it('valid archive checksum does not bypass mmdb format validation or overwrite prior artifact',async()=>{const dir=await mkdtemp(join(tmpdir(),'baize-geoip-invalid-'));try{await mkdir(dir+'/input');await writeFile(dir+'/input/GeoLite2-City.mmdb','not a MaxMind database');await exec('tar',['-czf',dir+'/fixture.tar.gz','-C',dir,'input']);const bytes=await readFile(dir+'/fixture.tar.gz'),hash=createHash('sha256').update(bytes).digest('hex');await writeFile(dir+'/GeoLite2-City.mmdb','previous invalid fixture artifact');const transport:Transport=async(url,opts)=>{expect(url.startsWith('https://download.maxmind.com/geoip/databases/GeoLite2-City/download')).toBe(true);expect(opts?.headers?.authorization).toMatch(/^Basic /);return {status:200,headers:{},text:url.includes('sha256')?hash:'',bytes};};await expect(downloadGeoIP(dir,'123','fixture-license',transport)).rejects.toThrow();expect(await readFile(dir+'/GeoLite2-City.mmdb','utf8')).toBe('previous invalid fixture artifact');expect((await geoIPStatus(dir)).configured).toBe(false);}finally{await rm(dir,{recursive:true,force:true});}});
 it('rejects an official-checksum-shaped response whose archive bytes do not match',async()=>{const dir=await mkdtemp(join(tmpdir(),'baize-geoip-hash-'));try{const transport:Transport=async url=>({status:200,headers:{},text:url.includes('sha256')?'0'.repeat(64):'',bytes:Buffer.from('different archive bytes')});await expect(downloadGeoIP(dir,'123','fixture-license',transport)).rejects.toThrow('checksum mismatch');}finally{await rm(dir,{recursive:true,force:true});}});
});
