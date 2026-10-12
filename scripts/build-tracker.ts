import {build} from 'esbuild';
import {minify} from 'rolldown/utils';
import {gzipSync,gunzipSync} from 'node:zlib';
import {gzipAsync} from '@gfx/zopfli';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
await mkdir('public',{recursive:true});
const license=(await readFile('packages/tracker/LICENSE','utf8')).trim();
await writeFile('public/tracker.LICENSE.txt',license+'\n');
const sizes:Record<string,number>={};
for(const [name,source] of Object.entries({'tracker':'browser','tracker-min':'browser','tracker-vitals':'vitals','tracker-replay':'replay','tracker-heatmap':'heatmap','tracker-consent':'consent'})){
const bundled=await build({write:false,entryPoints:[`packages/tracker/src/${source}.ts`],outfile:`public/${name}.js`,bundle:true,define:{__BAIZE_MIN__:String(name==='tracker-min')},minify:true,format:'iife',target:'es2020',legalComments:'inline'});
// Keep the existing ES2020 target and public/wire property names. This minifier
// is already pinned by Vite in the source lockfile; it does not remove console calls.
const optimized=await minify(`${name}.js`,bundled.outputFiles![0]!.text,{compress:{target:'es2020'},mangle:true,codegen:{legalComments:'inline'}});
if(optimized.errors.length)throw Error(JSON.stringify(optimized.errors));
// Preserve every word of the complete MIT notice; the separate copy stays byte-exact.
const script=Buffer.from(`/*! ${license.replace(/\s+/g,' ')} */\n${optimized.code}`);
await writeFile(`public/${name}.js`,script);
const compressed=Buffer.from(await gzipAsync(script,{numiterations:15}));
if(!gunzipSync(compressed).equals(script))throw Error('gzip round-trip mismatch');
await writeFile(`public/${name}.js.gz`,compressed);
const bytes=compressed.length;sizes[name]=bytes;console.log(`${name}: Zopfli gzip ${bytes}; default zlib gzip ${gzipSync(script).length}`);if((name==='tracker'||name==='tracker-min')&&bytes>=5000)throw Error(`${name}: ${bytes} gzip bytes must be strictly below 5000 gzip bytes`);
}
await writeFile('public/tracker-sizes.json',JSON.stringify(sizes,null,2));console.log(sizes);
