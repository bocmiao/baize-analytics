import {afterEach,expect,it} from 'vitest';
import Fastify from 'fastify';
import staticFiles from '@fastify/static';
import {mkdtemp,mkdir,writeFile,rm,readFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {brotliCompressSync,brotliDecompressSync,gzipSync,gunzipSync} from 'node:zlib';
import {build} from 'vite';
import {fingerprintedWebAsset,isWebAssetRequest,registerWebAssets,sendWebIndex,webAssetNotFound} from '../../src/shared/web-assets';
import {precompressWebAssets} from '../../scripts/web-asset-compression';

const cleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
async function fixture(){
 const root=await mkdtemp(resolve('.baize/web-assets-test-'));cleanup.push(()=>rm(root,{recursive:true,force:true}));
 const assets=join(root,'assets');await mkdir(assets);
 const source=Buffer.from('export const message = "白泽统计";\n'.repeat(150));
 await writeFile(join(root,'index.html'),'<!doctype html><title>Current build</title>');
 await writeFile(join(root,'private.txt'),'not exposed');
 await writeFile(join(root,'theme-init.js'),'document.documentElement.dataset.theme="light";');
 const file='index-AbCd1234.js';
 await writeFile(join(assets,file),source);await writeFile(join(assets,file+'.gz'),gzipSync(source));await writeFile(join(assets,file+'.br'),brotliCompressSync(source));
 await writeFile(join(assets,'runtime-ZzZz9999.js'),'small module');await writeFile(join(assets,'license.txt'),'license');
 const app=Fastify();await app.register(staticFiles,{root,serve:false,preCompressed:true,cacheControl:false});
 registerWebAssets(app,assets,root);
 app.setNotFoundHandler((req,reply)=>isWebAssetRequest(req.url)?webAssetNotFound(reply):sendWebIndex(reply,root));
 cleanup.push(()=>app.close());return {app,file,source,root};
}

it('serves negotiated Brotli/gzip assets with original MIME, byte equality and immutable caching',async()=>{
 const {app,file,source}=await fixture();
 for(const [accept,encoding] of [['gzip, br','br'],['gzip','gzip'],['br;q=0, gzip;q=1','gzip']] as const){
  const result=await app.inject({url:'/assets/'+file,headers:{'accept-encoding':accept}});
  expect(result.statusCode).toBe(200);expect(result.headers['content-encoding']).toBe(encoding);
  expect(result.headers['content-type']).toContain('javascript');expect(result.headers.vary).toBe('Accept-Encoding');
  expect(result.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  expect(encoding==='br'?brotliDecompressSync(result.rawPayload):gunzipSync(result.rawPayload)).toEqual(source);
  expect(result.rawPayload.length).toBeLessThan(source.length/3);
 }
 const plain=await app.inject({url:'/assets/'+file,headers:{'accept-encoding':'identity'}});
 expect(plain.headers['content-encoding']).toBeUndefined();expect(plain.rawPayload).toEqual(source);expect(plain.headers.vary).toBe('Accept-Encoding');
 const fallback=await app.inject({url:'/assets/runtime-ZzZz9999.js',headers:{'accept-encoding':'gzip, br'}});
 expect(fallback.statusCode).toBe(200);expect(fallback.body).toBe('small module');expect(fallback.headers['content-encoding']).toBeUndefined();expect(fallback.headers['cache-control']).toContain('immutable');
});

it('supports conditional/HEAD requests and leaves stable names revalidating',async()=>{
 const {app,file}=await fixture();const initial=await app.inject({url:'/assets/'+file,headers:{'accept-encoding':'br'}});
 const cached=await app.inject({url:'/assets/'+file,headers:{'accept-encoding':'br','if-none-match':String(initial.headers.etag)}});
 expect(cached.statusCode).toBe(304);expect(cached.body).toBe('');expect(cached.headers.vary).toBe('Accept-Encoding');expect(cached.headers['cache-control']).toContain('immutable');
 const head=await app.inject({method:'HEAD',url:'/assets/'+file,headers:{'accept-encoding':'gzip'}});
 expect(head.statusCode).toBe(200);expect(head.body).toBe('');expect(head.headers['content-encoding']).toBe('gzip');
 const stable=await app.inject('/assets/license.txt');expect(stable.headers['cache-control']).toBe('public, max-age=0, must-revalidate');
 const theme=await app.inject('/theme-init.js');expect(theme.statusCode).toBe(200);expect(theme.headers['content-type']).toContain('javascript');expect(theme.headers['cache-control']).toBe('public, max-age=0, must-revalidate');expect(theme.body).toContain('document.documentElement');
 expect(fingerprintedWebAsset('index-AbCd1234.js')).toBe(true);expect(fingerprintedWebAsset('logo.png')).toBe(false);
});

it('does not turn missing assets into cached HTML or allow paths outside the asset directory',async()=>{
 const {app,root}=await fixture();
 for(const url of ['/assets/missing-AbCd1234.js','/assets/%2e%2e%2fprivate.txt','/assets/%2fprivate.txt','/assets/.secret']){
  const result=await app.inject({url,headers:{'accept-encoding':'gzip, br'}});expect(result.statusCode).toBe(404);expect(result.headers['cache-control']).toBe('no-store');expect(result.body).not.toContain('not exposed');expect(result.headers['content-type']).not.toContain('text/html');
 }
 const index=await app.inject({url:'/sites/example/trend',headers:{'accept-encoding':'gzip, br'}});
 expect(index.statusCode).toBe(200);expect(index.body).toContain('Current build');expect(index.headers['cache-control']).toBe('no-store');
 await rm(join(root,'theme-init.js'));const missingTheme=await app.inject('/theme-init.js?v=test');expect(missingTheme.statusCode).toBe(404);expect(missingTheme.headers['cache-control']).toBe('no-store');expect(missingTheme.body).not.toContain('Current build');
});

it('emits decompressible sidecars from a real Vite build while preserving original entry files',async()=>{
 const root=await mkdtemp(resolve('.baize/web-asset-build-'));cleanup.push(()=>rm(root,{recursive:true,force:true}));
 await writeFile(join(root,'index.html'),'<script type="module" src="/main.js"></script>');
 await writeFile(join(root,'main.js'),'import "./style.css";document.body.textContent='+JSON.stringify(Array.from({length:2500},(_,i)=>'访客'+i).join('|'))+';document.onclick=()=>import("./lazy.js").then(m=>m.show());');
 await writeFile(join(root,'lazy.js'),'import "./lazy.css";export const show=()=>document.body.textContent="loaded";');
 await writeFile(join(root,'style.css'),Array.from({length:120},(_,i)=>'.text-'+i+'{color:rgb('+i+',0,0)}').join('\n'));
 await writeFile(join(root,'lazy.css'),'.lazy{color:blue}');
 await build({configFile:false,root,logLevel:'silent',plugins:[precompressWebAssets()],build:{outDir:'dist',minify:false}});
 const dir=join(root,'dist/assets'),files=await readdir(dir),entry=files.find(file=>file.endsWith('.js'))!;
 expect(entry).toBeTruthy();const source=await readFile(join(dir,entry));
 expect(gunzipSync(await readFile(join(dir,entry+'.gz')))).toEqual(source);
 expect(brotliDecompressSync(await readFile(join(dir,entry+'.br')))).toEqual(source);
 expect(fingerprintedWebAsset(entry)).toBe(true);expect(await readFile(join(root,'dist/index.html'),'utf8')).toContain(entry);
 for(const file of files.filter(file=>file.endsWith('.gz'))){
  const original=await readFile(join(dir,file.slice(0,-3)));
  expect(gunzipSync(await readFile(join(dir,file)))).toEqual(original);
  expect(brotliDecompressSync(await readFile(join(dir,file.slice(0,-3)+'.br')))).toEqual(original);
 }
});
