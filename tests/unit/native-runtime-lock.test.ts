import {describe,it,expect} from 'vitest';
import {mkdtemp,rm,chmod,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {acquireNativeRuntimeLock} from '../../src/release/runtime-lock.js';

describe('native maintenance/runtime ownership',()=>{
 it('excludes a second writer and allows restart after graceful close',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'baize-native-lock-'));
  try{const release=await acquireNativeRuntimeLock(directory,()=>{});try{await expect(acquireNativeRuntimeLock(directory,()=>{})).rejects.toThrow('NATIVE_RUNTIME_ALREADY_RUNNING');}finally{await release();}await(await acquireNativeRuntimeLock(directory,()=>{}))();}finally{await rm(directory,{recursive:true,force:true});}
 });
 it('rejects public data directories and a redirected lock file',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'baize-native-private-'));
  try{await chmod(directory,0o755);await expect(acquireNativeRuntimeLock(directory,()=>{})).rejects.toThrow('NATIVE_DATA_DIRECTORY_NOT_PRIVATE');await chmod(directory,0o700);await symlink('/dev/null',join(directory,'native-runtime.lock'));await expect(acquireNativeRuntimeLock(directory,()=>{})).rejects.toThrow();}finally{await rm(directory,{recursive:true,force:true});}
 });
 it('releases the OS lock after abrupt owner death without deleting the lock',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'baize-native-kill-'));
  const module=resolve('src/release/runtime-lock.ts');
  const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',`import {acquireNativeRuntimeLock} from ${JSON.stringify(module)}; await acquireNativeRuntimeLock(${JSON.stringify(directory)},()=>process.exit(1)); console.log('ready'); setInterval(()=>{},1000);`],{cwd:resolve('.'),stdio:['ignore','pipe','pipe']});
  try{await new Promise<void>((ready,reject)=>{const timer=setTimeout(()=>reject(Error('child lock timeout')),10000);child.stdout.once('data',()=>{clearTimeout(timer);ready();});child.once('exit',()=>{clearTimeout(timer);reject(Error('child failed'));});});const exited=once(child,'exit');child.kill('SIGKILL');await exited;
   let release:(()=>Promise<void>)|undefined;for(let n=0;n<30;n++){try{release=await acquireNativeRuntimeLock(directory,()=>{});break;}catch{await new Promise(done=>setTimeout(done,50));}}expect(release).toBeDefined();await release!();
  }finally{child.kill('SIGKILL');await rm(directory,{recursive:true,force:true});}
 });
});
