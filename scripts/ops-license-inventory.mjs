import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const raw=await readFile('package-lock.json'),lock=JSON.parse(raw);
const packages=Object.entries(lock.packages).filter(([path])=>path).map(([path,p])=>({name:p.name??path.split('node_modules/').at(-1),version:p.version??'UNKNOWN',license:p.license??'UNKNOWN',development:Boolean(p.dev),optional:Boolean(p.optional),integrity:p.integrity??null,path})).sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version));
const unknown=packages.filter(p=>p.license==='UNKNOWN');await mkdir('docs/licenses',{recursive:true});
await writeFile('docs/licenses/npm-license-inventory.json',JSON.stringify({source:'package-lock.json',sha256:createHash('sha256').update(raw).digest('hex'),scope:'Lockfile metadata only; not a legal or release compliance audit',packages,unknown},null,2)+'\n');
await writeFile('docs/licenses/npm-license-inventory.csv','name,version,license,development,optional,path\n'+packages.map(p=>[p.name,p.version,p.license,p.development,p.optional,p.path].map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n')+'\n');
console.log(JSON.stringify({packages:packages.length,unknown:unknown.length,unknownPackages:unknown.map(p=>p.name+'@'+p.version)}));
