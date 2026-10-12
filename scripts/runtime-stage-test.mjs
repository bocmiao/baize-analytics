import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,readlinkSync,renameSync,rmSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,isAbsolute} from 'node:path';
import {execFileSync} from 'node:child_process';
import {copyRuntimeEntry} from './runtime-stage.mjs';

test('runtime copying preserves relative links after the source and staging trees move',()=>{
 const scratch=mkdtempSync(join(tmpdir(),'baize-runtime-copy-test-'));
 try{
  const source=join(scratch,'source'),stage=join(scratch,'stage'),moved=join(scratch,'moved');
  mkdirSync(join(source,'node_modules','.bin'),{recursive:true});
  mkdirSync(join(source,'node_modules','probe'));
  writeFileSync(join(source,'node_modules','probe','cli.js'),"console.log('relocated-runtime-ok');\n");
  symlinkSync('../probe/cli.js',join(source,'node_modules','.bin','probe'));
  copyRuntimeEntry(source,stage);rmSync(source,{recursive:true});renameSync(stage,moved);
  assert.equal(readlinkSync(join(moved,'node_modules','.bin','probe')),'../probe/cli.js');
  assert.equal(execFileSync(process.execPath,[join(moved,'node_modules','.bin','probe')],{encoding:'utf8'}).trim(),'relocated-runtime-ok');
 }finally{rmSync(scratch,{recursive:true,force:true});}
});

test('actual installed npm bins remain relative and esbuild/tsx execute after relocation',()=>{
 const source=resolve('node_modules'),scratch=mkdtempSync(join(tmpdir(),'baize-runtime-real-bins-'));
 try{
  const modules=join(scratch,'node_modules');mkdirSync(join(modules,'.bin'),{recursive:true});
  const links=readdirSync(join(source,'.bin')).filter(name=>existsSync(join(source,'.bin',name)));
  for(const name of links)assert.equal(isAbsolute(readlinkSync(join(source,'.bin',name))),false,name);
  for(const name of ['esbuild','tsx','@esbuild'])copyRuntimeEntry(join(source,name),join(modules,name));
  for(const name of ['esbuild','tsx']){
   copyRuntimeEntry(join(source,'.bin',name),join(modules,'.bin',name));
   assert.equal(readlinkSync(join(modules,'.bin',name)),readlinkSync(join(source,'.bin',name)));
  }
  assert.match(execFileSync(join(modules,'.bin','esbuild'),['--version'],{encoding:'utf8'}),/^\d+\.\d+/);
  assert.match(execFileSync(join(modules,'.bin','tsx'),['--version'],{encoding:'utf8'}),/tsx v/);
  writeFileSync(join(scratch,'probe.ts'),"const result: string = 'tsx-relocated-ok';console.log(result);\n");
  assert.equal(execFileSync(join(modules,'.bin','tsx'),[join(scratch,'probe.ts')],{encoding:'utf8'}).trim(),'tsx-relocated-ok');
 }finally{rmSync(scratch,{recursive:true,force:true});}
});
