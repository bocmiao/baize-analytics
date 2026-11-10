import {promisify} from 'node:util';
import {brotliCompress,gzip,constants} from 'node:zlib';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {Plugin} from 'vite';

const brotli=promisify(brotliCompress),gzipAsset=promisify(gzip);

/** Compress once at build time, without spending request CPU on dashboard assets. */
export function precompressWebAssets():Plugin {
 return {
  name:'baize-precompressed-web-assets',
  apply:'build',
  async writeBundle(options,bundle){
   if(!options.dir)return;
   for(const fileName of Object.keys(bundle)){
    if(!fileName.startsWith('assets/')||! /\.(?:js|css|svg|json)$/.test(fileName))continue;
    // Vite rewrites preload dependencies and CSS markers after generateBundle.
    // Read the final bytes so compressed and identity representations agree.
    const path=resolve(options.dir,fileName),source=await readFile(path);
    if(source.length<1024)continue;
    const [br,gz]=await Promise.all([
     brotli(source,{params:{[constants.BROTLI_PARAM_QUALITY]:9}}),
     gzipAsset(source,{level:9}),
    ]);
    if(br.length<source.length)await writeFile(path+'.br',br);
    if(gz.length<source.length)await writeFile(path+'.gz',gz);
   }
  },
 };
}
