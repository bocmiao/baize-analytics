import {spawn} from 'node:child_process';
import {constants} from 'node:fs';
import {mkdir,open,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';

/** Native single-instance releases share this lock with offline maintenance. */
export async function acquireNativeRuntimeLock(dataDir:string,onLost:()=>void){
 const directory=resolve(dataDir);await mkdir(directory,{recursive:true,mode:0o700});
 const metadata=await lstat(directory);
 if(!metadata.isDirectory()||metadata.isSymbolicLink()||(metadata.mode&0o077))throw Error('NATIVE_DATA_DIRECTORY_NOT_PRIVATE');
 const file=await open(join(directory,'native-runtime.lock'),constants.O_CREAT|constants.O_RDWR|constants.O_NOFOLLOW,0o600);
 try{const stat=await file.stat();if(!stat.isFile()||stat.nlink!==1||(stat.mode&0o077))throw Error('NATIVE_RUNTIME_LOCK_UNTRUSTED');}finally{await file.close();}
 const helper=spawn('flock',['-n',join(directory,'native-runtime.lock'),'sh','-c','printf "locked\\n"; cat >/dev/null'],{stdio:['pipe','pipe','pipe']});
 let releasing=false,acquired=false;
 await new Promise<void>((ready,reject)=>{
  helper.stdout!.once('data',()=>{acquired=true;ready();});
  helper.once('error',()=>reject(Error('NATIVE_RUNTIME_LOCK_TOOL_UNAVAILABLE')));
  helper.once('exit',()=>{helper.stdin?.destroy();if(!acquired)reject(Error('NATIVE_RUNTIME_ALREADY_RUNNING'));else if(!releasing)onLost();});
 });
 return async()=>{if(releasing)return;releasing=true;if(helper.exitCode!==null||helper.signalCode!==null)return;const exited=new Promise<void>(done=>helper.once('exit',()=>done()));helper.stdin!.end();await exited;};
}
