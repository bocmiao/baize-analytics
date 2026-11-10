import{build}from'esbuild';
import{test}from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import{gunzipSync}from'node:zlib';
import{Script}from'node:vm';

test('real full tracker is below decimal 5000 bytes with intact MIT notice and gzip content',()=>{
 const license=readFileSync('packages/tracker/LICENSE','utf8');
 assert.equal(readFileSync('public/tracker.LICENSE.txt','utf8'),license.trim()+'\n');
 const sizes=JSON.parse(readFileSync('public/tracker-sizes.json','utf8'));
 for(const name of ['tracker','tracker-min','tracker-vitals','tracker-replay','tracker-heatmap','tracker-consent','tracker-visual']){
  const script=readFileSync(`public/${name}.js`),compressed=readFileSync(`public/${name}.js.gz`);
  assert.deepEqual(gunzipSync(compressed),script,name);
  assert.equal(sizes[name],compressed.length,name);
  assert.ok(script.toString().startsWith(`/*! ${license.trim().replace(/\s+/g,' ')} */\n`),name);
  assert.doesNotThrow(()=>new Script(script.toString()),name);
  if(name==='tracker'||name==='tracker-min')assert.ok(compressed.length<5000,`${name}: ${compressed.length} must be <5000 decimal bytes`);
 }
});

test('every variant retains all legal notices emitted by the original esbuild bundle',async()=>{
 const variants={tracker:'browser','tracker-min':'browser','tracker-vitals':'vitals','tracker-replay':'replay','tracker-heatmap':'heatmap','tracker-consent':'consent','tracker-visual':'visual'};
 let thirdPartyNotices=0;
 for(const [name,source] of Object.entries(variants)){
  const original=await build({write:false,entryPoints:[`packages/tracker/src/${source}.ts`],bundle:true,define:{__BAIZE_MIN__:String(name==='tracker-min')},minify:true,format:'iife',target:'es2020',legalComments:'inline'});
  const baseline=original.outputFiles[0].text;
  const actual=readFileSync(`public/${name}.js`,'utf8').replace(/\s+/g,' ');
  const notices=baseline.match(/\/\*[!*][\s\S]*?\*\//g)??[];
  for(const notice of notices){assert.ok(actual.includes(notice.replace(/\s+/g,' ')),`${name}: missing original legal notice ${notice.slice(0,100)}`);thirdPartyNotices++;}
 }
 // rrweb includes upstream notices, so a fixture that accidentally drops all notices rejects.
 assert.ok(thirdPartyNotices>0,'expected actual third-party legal notices');
});
