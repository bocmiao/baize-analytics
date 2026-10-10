import {readdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const files=['LICENSE','package.json','package-lock.json','tsconfig.json','tsconfig.server.json','vite.config.ts'];
async function walk(directory){for(const entry of(await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const path=join(directory,entry.name);if(entry.isDirectory())await walk(path);else if(entry.isFile())files.push(path);}}
for(const dir of['src','packages','plugins','sdk','db','scripts'])await walk(dir);
for(const path of files.sort())console.log(createHash('sha256').update(await readFile(path)).digest('hex')+'  '+path);
