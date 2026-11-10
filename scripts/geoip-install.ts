import {resolve} from 'node:path';
import {GeoIP,geoIPStatus} from '../src/server/geoip.js';
import {installIP2Region} from '../src/server/ip2region-snapshot.js';

const args=process.argv.slice(2),option=(name:string)=>{const index=args.indexOf(name);return index>=0?args[index+1]:undefined;};
const data=option('--data-dir')||process.env.DATA_DIR;
if(!data)throw Error('Usage: geoip-install --data-dir /app/data [--from /offline/snapshot] [--check]');
const dataDir=resolve(data),from=option('--from');
if(!args.includes('--check'))await installIP2Region(dataDir,{...(from?{fromDirectory:resolve(from)}:{})});
const database=await geoIPStatus(dataDir,'ip2region');
if(!database.configured)throw Error('Offline geography database is not ready');
const geo=new GeoIP();await geo.open(dataDir,'ip2region');
const probes=['1.0.1.1','223.5.5.5','2400:3200::1','2001:4860:4860::8888'].map(ip=>({ip,...geo.lookup(ip)}));
if(probes.some(row=>row.country==='unknown'||row.isp==='unknown'))throw Error('Offline geography lookup verification failed');
console.log(JSON.stringify({database,probes},null,2));
