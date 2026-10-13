import {readFileSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {publishDelta} from '../src/update/publisher.js';
import {safeAncestors} from '../src/release/preflight.js';
const allowed=new Set(['base','target','output','key-file','key-id','label','notes-file']);const fields:Record<string,string>={};
for(let i=2;i<process.argv.length;i+=2){const flag=process.argv[i]!,value=process.argv[i+1];if(!flag.startsWith('--')||!allowed.has(flag.slice(2))||!value||fields[flag.slice(2)])throw Error('UPDATE_PUBLISH_ARGUMENT_INVALID');fields[flag.slice(2)]=value;}
for(const required of ['base','target','output','key-file','key-id','label'])if(!fields[required])throw Error('UPDATE_PUBLISH_ARGUMENT_REQUIRED');
const keyPath=resolve(fields['key-file']!);safeAncestors(keyPath);const key=lstatSync(keyPath);if(!key.isFile()||key.nlink!==1||key.uid!==process.getuid!()||(key.mode&0o777)!==0o600||key.size>8192)throw Error('UPDATE_SIGNING_KEY_FILE_UNTRUSTED');
const notes=fields['notes-file']?JSON.parse(readFileSync(resolve(fields['notes-file']),'utf8')):[];
console.log(JSON.stringify(publishDelta({baseRoot:fields.base!,targetRoot:fields.target!,output:fields.output!,privateKey:readFileSync(keyPath,'utf8'),keyId:fields['key-id']!,label:fields.label!,notes}),null,2));
