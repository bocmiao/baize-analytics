import {build} from 'esbuild';
import {mkdirSync,copyFileSync,readFileSync,existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
mkdirSync('dist/updater',{recursive:true});
const roots=new Set<string>();
for(const [entry,name]of [['src/update/cli.ts','baize-updater.mjs'],['src/update/docker-agent.ts','baize-docker-updater.mjs']]){
 const result=await build({entryPoints:[entry!],outfile:'dist/updater/'+name,bundle:true,platform:'node',target:'node24',format:'esm',external:['pg-native'],metafile:true,banner:{js:"import {createRequire as updaterCreateRequire} from 'node:module';const require=updaterCreateRequire(import.meta.url);"}});
 for(const input of Object.keys(result.metafile.inputs)){const parts=input.split('/'),index=parts.lastIndexOf('node_modules');if(index<0)continue;roots.add(parts.slice(0,index+(parts[index+1]!.startsWith('@')?3:2)).join('/'));}
}
copyFileSync('LICENSE','dist/updater/LICENSE');let notices='Bundled updater third-party notices\n';
for(const root of [...roots].sort()){
 const metadata=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));let text:string|undefined;
 const license=['LICENSE','LICENSE.md','LICENSE-MIT','license','LICENSE.txt','COPYING'].find(path=>existsSync(join(root,path)));
 if(license)text=readFileSync(join(root,license),'utf8');
 else if(existsSync(join(root,'README.md'))){const readme=readFileSync(join(root,'README.md'),'utf8'),start=readme.search(/The MIT License|MIT License|Copyright \(c\)/);if(start>=0&&readme.includes('Permission is hereby granted'))text=readme.slice(start);}
 if(!text)throw Error('UPDATER_LICENSE_MISSING:'+metadata.name);
 notices+='\n=== '+metadata.name+' '+metadata.version+' '+metadata.license+' ===\n'+text;
}
writeFileSync('dist/updater/THIRD_PARTY_NOTICES.txt',notices);
