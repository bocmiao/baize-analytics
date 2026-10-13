import {constants,closeSync,existsSync,fsyncSync,lstatSync,mkdirSync,openSync,readFileSync,renameSync,writeFileSync,statfsSync,fstatSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {safeAncestors} from '../release/preflight.js';

export const SPACE_FLOOR=2147483648;
export const STOP_RESERVE=1073741824;
export function privateDirectory(path:string){safeAncestors(path);if(!existsSync(path))mkdirSync(path,{recursive:true,mode:0o700});const s=lstatSync(path);if(!s.isDirectory()||s.isSymbolicLink()||s.mode&0o077||s.uid!==process.getuid!())throw Error('UPDATE_DIRECTORY_NOT_PRIVATE');}
export function durableJSON(path:string,value:unknown,mode=0o600){
 safeAncestors(path);const temporary=path+'.pending';
 if(existsSync(temporary)){const s=lstatSync(temporary);if(!s.isFile()||s.nlink!==1||s.uid!==process.getuid!())throw Error('UPDATE_TRANSACTION_FILE_UNTRUSTED');}
 const fd=openSync(temporary,constants.O_CREAT|constants.O_TRUNC|constants.O_WRONLY|constants.O_NOFOLLOW,mode);
 try{writeFileSync(fd,JSON.stringify(value));fsyncSync(fd);}finally{closeSync(fd);}
 renameSync(temporary,path);syncDirectory(dirname(path));
}
export function syncDirectory(path:string){const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
export function trustedJSON<T>(path:string,max=24*1024*1024):T{
 safeAncestors(path);const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const s=fstatSync(fd);if(!s.isFile()||s.nlink!==1||s.size>max||s.uid!==process.getuid!()||s.mode&0o022)throw Error('UPDATE_STATE_UNTRUSTED');return JSON.parse(readFileSync(fd,'utf8')) as T;}finally{closeSync(fd);}
}
export function freeBytes(path:string){const stat=statfsSync(path);return stat.bavail*stat.bsize;}
export function guardSpace(path:string,reserve=0){if(freeBytes(path)<SPACE_FLOOR+STOP_RESERVE+reserve)throw Error('UPDATE_SPACE_PROTECTION');}
export type Phase='idle'|'checking'|'ready'|'preflight'|'downloading'|'staged'|'maintenance'|'backup'|'switching'|'health'|'completed'|'rolling_back'|'rolled_back'|'failed'|'interrupted';
export interface Pointer {root:string;revision:string;manifestSha256:string}
export interface UpdateState {
 version:1;phase:Phase;operationId?:string;requestFingerprint?:string;actorId?:string;from?:Pointer;target?:Pointer;previous?:Pointer;
 label?:string;notes?:string[];error?:string;availableRevision?:string;availableManifestSha256?:string;fixture?:boolean;plannedPayloadBytes?:number;metadataBytes?:number;downloadedPayloadBytes?:number;
 changedFiles?:string[];unchangedFiles?:string[];deletedFiles?:string[];deletedDirectories?:string[];backupPath?:string;
 steps:Record<string,'pending'|'running'|'passed'|'failed'|'skipped'>;updatedAt:string;history:{phase:Phase;at:string}[];
}
export class StateStore {
 readonly path:string;state:UpdateState;
 constructor(readonly root:string){privateDirectory(root);this.path=join(root,'state.json');this.state=existsSync(this.path)?trustedJSON<UpdateState>(this.path):{version:1,phase:'idle',steps:{},updatedAt:new Date().toISOString(),history:[]};if(this.state.version!==1||!Array.isArray(this.state.history)||typeof this.state.steps!=='object'||!['idle','checking','ready','preflight','downloading','staged','maintenance','backup','switching','health','completed','rolling_back','rolled_back','failed','interrupted'].includes(this.state.phase))throw Error('UPDATE_STATE_CORRUPT');}
 save(patch:Partial<UpdateState>){this.state={...this.state,...patch,updatedAt:new Date().toISOString()};if(patch.phase)this.state.history=[...this.state.history,{phase:patch.phase,at:this.state.updatedAt}].slice(-200);durableJSON(this.path,this.state);return this.state;}
 phase(phase:Phase,step?:string){return this.save({phase,...step?{steps:{...this.state.steps,[step]:'running' as const}}:{}});}
 passed(step:string){return this.save({steps:{...this.state.steps,[step]:'passed'}});}
}
