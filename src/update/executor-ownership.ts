import {existsSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {durableJSON,trustedJSON,syncDirectory} from './state.js';
/** Physical flock loss does not allow another executor to overlap a still-quiescing owner. */
export class ExecutorOwnership {
 private readonly token=randomUUID();private claimed=false;private readonly path:string;
 constructor(private readonly directory:string){this.path=join(directory,'executor-owner.json');}
 claim(){
  if(existsSync(this.path)){const old=trustedJSON<{version:number;pid:number;token:string}>(this.path);if(old.version!==1||!Number.isInteger(old.pid)||old.pid<=0||typeof old.token!=='string')throw Error('UPDATE_EXECUTOR_OWNER_CORRUPT');let alive=true;try{process.kill(old.pid,0);}catch(e){alive=(e as NodeJS.ErrnoException).code!=='ESRCH';}if(alive)throw Error('UPDATE_EXECUTOR_PREVIOUS_OWNER_RUNNING');}
  durableJSON(this.path,{version:1,pid:process.pid,token:this.token});this.claimed=true;
 }
 owns(){return this.claimed&&existsSync(this.path)&&trustedJSON<{token:string}>(this.path).token===this.token;}
 assert(){if(!this.owns())throw Error('UPDATE_EXECUTOR_LOCK_LOST');}
 release(){if(this.owns()){unlinkSync(this.path);syncDirectory(this.directory);}this.claimed=false;}
}
