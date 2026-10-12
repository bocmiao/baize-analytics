import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync,mkdirSync,mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {deriveRuntimePackage,documentationWhitelist,exportReleaseDocumentation,releaseFiles,releaseReadmeNotice,rewriteDocumentationLinks,verifyRelease} from './package-release.mjs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
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
test('documentation whitelist comes from exact real Git blobs, excludes history and private state',()=>{
 const root=fixture(),checkout=fileURLToPath(new URL('..',import.meta.url));try{
  const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:checkout,encoding:'utf8'}).trim();
  const witness=exportReleaseDocumentation(checkout,revision,root);assert.equal(witness.length,documentationWhitelist.length);
  for(const item of witness){const original=execFileSync('git',['show',`${revision}:${item.path}`],{cwd:checkout});const copied=readFileSync(join(root,item.path));assert.equal(item.sourceSha256,createHash('sha256').update(original).digest('hex'));assert.equal(item.derivedDocSha256,createHash('sha256').update(copied).digest('hex'));if(!['README.md','docs/api.md','docs/migration.md'].includes(item.path))assert.deepEqual(copied,original);else{let restored=copied.toString('utf8');if(item.readmeNoticeAdded){assert.ok(restored.startsWith(releaseReadmeNotice));restored=restored.slice(releaseReadmeNotice.length);}for(const link of item.rewrittenLinks)restored=restored.replace(link.to,link.from);assert.equal(restored,original.toString('utf8'));}assert.equal(item.revision,revision);assert.match(item.gitBlobId,/^[a-f0-9]{40}$/);}
  assert.ok(witness.some(item=>item.path==='deploy/baize.service.example'));assert.ok(!witness.some(item=>/test-evidence|screenshots|validation|\.env|\.key/.test(item.path)));
  assert.throws(()=>exportReleaseDocumentation(checkout,'wrong',root),/RELEASE_DOCUMENTATION_REVISION_INVALID/);
 }finally{cleanup(root);}
});
test('documentation derivation changes only missing link targets and preserves local guide links/text',()=>{
 const source='正文 [本地](lite-deployment.md#部署)；[历史](test-evidence/old.json)；[源码目录](../sdk/)；![截图](screenshots/a.png "图")；[网址](https://example.test)；[章节](#标题)\n尾文';
 const revision='a'.repeat(40),result=rewriteDocumentationLinks(source,'docs/api.md',revision);
 assert.equal(result.rewritten.length,3);assert.ok(result.content.includes('(lite-deployment.md#部署)'));assert.ok(result.content.includes('/tree/'+revision+'/sdk/'));
 let restored=result.content;for(const link of result.rewritten)restored=restored.replace(link.to,link.from);assert.equal(restored,source);
});
