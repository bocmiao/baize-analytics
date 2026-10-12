import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync,mkdirSync,mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {deriveRuntimePackage,releaseFiles,verifyRelease} from './package-release.mjs';
function fixture(){const root=mkdtempSync(join(tmpdir(),'baize-release-check-'));mkdirSync(join(root,'scripts'));writeFileSync(join(root,'package.json'),'{"type":"module"}\n');writeFileSync(join(root,'scripts','release-start.sh'),'#!/bin/sh\nexit 0\n',{mode:0o755});symlinkSync('scripts/release-start.sh',join(root,'start'));return root;}
function manifest(root){return {version:1,profile:'lite',variant:'node-ready',revision:'a'.repeat(40),imageId:'sha256:'+'b'.repeat(64),platform:{os:'linux',architecture:'amd64'},...releaseFiles(root,{seal:true})};}
function cleanup(root){chmodSync(root,0o700);chmodSync(join(root,'scripts'),0o700);rmSync(root,{recursive:true,force:true});}
test('real sealed files and internal symlink survive manifest verification; mutation and extras reject',()=>{
 const root=fixture();try{const value=manifest(root);writeFileSync(join(root,'release-manifest.json'),JSON.stringify(value),{mode:0o444});assert.deepEqual(verifyRelease(root),value);chmodSync(join(root,'package.json'),0o644);writeFileSync(join(root,'package.json'),'altered');assert.throws(()=>verifyRelease(root),/RELEASE_CONTENT_MISMATCH/);writeFileSync(join(root,'package.json'),'{"type":"module"}\n');chmodSync(join(root,'package.json'),0o444);writeFileSync(join(root,'extra'),'unexpected');assert.throws(()=>verifyRelease(root),/RELEASE_CONTENT_MISMATCH/);}finally{cleanup(root);}
});
test('absolute and escaping symlinks and external state are rejected before sealing',()=>{
 for(const target of ['/tmp/outside','../outside']){const root=fixture();try{symlinkSync(target,join(root,'escape'));assert.throws(()=>releaseFiles(root),/RELEASE_LINK_ESCAPE/);}finally{cleanup(root);}}
 const root=fixture();try{mkdirSync(join(root,'data'));writeFileSync(join(root,'data','private'),'state');assert.throws(()=>releaseFiles(root),/RELEASE_FORBIDDEN_PATH/);}finally{cleanup(root);}
});
test('Linux profile/revision identity is required, mode changes are detected',()=>{
 const root=fixture();try{const value=manifest(root);writeFileSync(join(root,'release-manifest.json'),JSON.stringify({...value,revision:'wrong'}));assert.throws(()=>verifyRelease(root),/RELEASE_MANIFEST_INVALID/);writeFileSync(join(root,'release-manifest.json'),JSON.stringify(value));chmodSync(join(root,'scripts','release-start.sh'),0o444);assert.throws(()=>verifyRelease(root),/RELEASE_CONTENT_MISMATCH/);assert.ok(readFileSync(join(root,'release-manifest.json'),'utf8'));}finally{cleanup(root);}
});
test('npm start derivation changes only start, preserves original/lock bytes and verifies installed versions',()=>{
 const root=fixture();try{
  const source={name:'release-fixture',version:'1.0.0',type:'module',scripts:{start:'tsx src/server/main.ts',worker:'tsx src/server/worker.ts'},dependencies:{fixture:'1.0.0'},devDependencies:{tsx:'4.0.0'}};
  const bytes=JSON.stringify(source)+'\n';writeFileSync(join(root,'package.json'),bytes);
  const lock=JSON.stringify({name:source.name,version:source.version,packages:{'':{dependencies:source.dependencies},'node_modules/fixture':{version:'1.0.0'}}});writeFileSync(join(root,'package-lock.json'),lock);
  mkdirSync(join(root,'node_modules','fixture'),{recursive:true});writeFileSync(join(root,'node_modules','fixture','package.json'),'{"version":"1.0.0"}');
  const provenance=deriveRuntimePackage(root);assert.equal(provenance.installedPackageVersionChecks,1);assert.equal(provenance.runtimePackageDerived,true);
  assert.equal(readFileSync(join(root,'source-package.json'),'utf8'),bytes);assert.equal(readFileSync(join(root,'package-lock.json'),'utf8'),lock);
  assert.deepEqual(JSON.parse(readFileSync(join(root,'package.json'),'utf8')),{...source,scripts:{...source.scripts,start:'node dist/server/src/release/panel-start.js'}});
  writeFileSync(join(root,'package.json'),bytes);writeFileSync(join(root,'node_modules','fixture','package.json'),'{"version":"2.0.0"}');assert.throws(()=>deriveRuntimePackage(root),/RELEASE_INSTALLED_VERSION_MISMATCH/);
 }finally{cleanup(root);}
});
