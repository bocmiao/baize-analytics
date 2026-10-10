import {build} from 'esbuild';
import {gzipSync} from 'node:zlib';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
await mkdir('public',{recursive:true});
const license=(await readFile('packages/tracker/LICENSE','utf8')).trim();
await writeFile('public/tracker.LICENSE.txt',license+'\n');
const sizes:Record<string,number>={};
for(const [name,source] of Object.entries({'tracker':'browser','tracker-min':'browser','tracker-vitals':'vitals','tracker-replay':'replay','tracker-heatmap':'heatmap','tracker-consent':'consent'})){
await build({entryPoints:[`packages/tracker/src/${source}.ts`],outfile:`public/${name}.js`,bundle:true,define:{__BAIZE_MIN__:String(name==='tracker-min')},minify:true,format:'iife',target:'es2020',legalComments:'inline',banner:{js:'/*! Copyright (c) 2026 Baize contributors. MIT License: tracker.LICENSE.txt */'}});
const bytes=gzipSync(await readFile(`public/${name}.js`)).length;sizes[name]=bytes;if((name==='tracker'||name==='tracker-min')&&bytes>5120)throw Error(`${name}: ${bytes} gzip bytes exceeds 5KB budget`);
}
await writeFile('public/tracker-sizes.json',JSON.stringify(sizes,null,2));console.log(sizes);
