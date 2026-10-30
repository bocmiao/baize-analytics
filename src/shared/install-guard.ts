import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {constants,openSync,closeSync,fstatSync,lstatSync,mkdirSync,readSync,writeFileSync,fsyncSync,unlinkSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
export const INSTALL_NONCE_FILENAME='install-nonce.json';
export const INSTALL_RECOVERY_BLOCK_FILENAME='install-recovery-block.json';
const digest=(nonce:string)=>createHash('sha256').update(nonce).digest('hex');
function failure(code:string):never{throw Object.assign(new Error(code),{statusCode:503});}
function directory(keyDir:string):{fd:number;path:string}{
 const path=resolve(keyDir);let ancestor=path;
 for(;;){try{if(lstatSync(ancestor).isSymbolicLink())failure('INSTALL_DIRECTORY_UNSAFE');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}const parent=dirname(ancestor);if(parent===ancestor)break;ancestor=parent;}
 mkdirSync(path,{recursive:true,mode:0o700});const fd=openSync(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 const stat=fstatSync(fd);/* POSIX mode bits are advisory on Windows and always report group/other access. */if(!stat.isDirectory()||(process.platform!=='win32'&&(stat.mode&0o077)!==0)||(process.getuid&&stat.uid!==process.getuid())){closeSync(fd);failure('INSTALL_DIRECTORY_UNSAFE');}
 return {fd,path};
}
function anchored(dir:{fd:number;path:string},name:string){return process.platform==='linux'?`/proc/self/fd/${dir.fd}/${name}`:join(dir.path,name);}
function readPrivate(dir:{fd:number;path:string},name:string):unknown{
 let fd:number;try{fd=openSync(anchored(dir,name),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')failure('INSTALL_CREDENTIAL_MISSING');failure('INSTALL_CREDENTIAL_UNSAFE');}
 try{const stat=fstatSync(fd);if(!stat.isFile()||stat.nlink!==1||(process.platform!=='win32'&&(stat.mode&0o077)!==0)||(process.getuid&&stat.uid!==process.getuid())||stat.size>1024)failure('INSTALL_CREDENTIAL_UNSAFE');try{const bytes=Buffer.alloc(1025),length=readSync(fd,bytes,0,bytes.length,0);if(length>1024)failure('INSTALL_CREDENTIAL_UNSAFE');return JSON.parse(bytes.subarray(0,length).toString('utf8'));}catch{failure('INSTALL_CREDENTIAL_INVALID');}}finally{closeSync(fd);}
}
function nonceHash(dir:{fd:number;path:string}):string{const value=readPrivate(dir,INSTALL_NONCE_FILENAME) as {version?:unknown;nonce?:unknown};if(value?.version!==1||typeof value.nonce!=='string'||!/^[a-f0-9]{64}$/.test(value.nonce))failure('INSTALL_CREDENTIAL_INVALID');return digest(value.nonce);}
export function hasRestoreBootstrapBlock(keyDir:string):boolean{const dir=directory(keyDir);try{try{lstatSync(anchored(dir,INSTALL_RECOVERY_BLOCK_FILENAME));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;failure('INSTALL_RECOVERY_BLOCK_INVALID');}const marker=readPrivate(dir,INSTALL_RECOVERY_BLOCK_FILENAME) as {version?:unknown;state?:unknown};if(marker?.version!==1||marker.state!=='restored_blocked')failure('INSTALL_RECOVERY_BLOCK_INVALID');return true;}finally{closeSync(dir.fd);}}
export function ensurePrivateInstallNonce(keyDir:string):{path:string;hash:string}{
 if(hasRestoreBootstrapBlock(keyDir))failure('INSTALL_RECOVERY_BLOCKED');const dir=directory(keyDir);try{let fd:number|undefined;try{fd=openSync(anchored(dir,INSTALL_NONCE_FILENAME),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);writeFileSync(fd,JSON.stringify({version:1,nonce:randomBytes(32).toString('hex')}));fsyncSync(fd);if(process.platform!=='win32')fsyncSync(dir.fd);}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')failure('INSTALL_CREDENTIAL_UNAVAILABLE');}finally{if(fd!==undefined)closeSync(fd);}return {path:join(dir.path,INSTALL_NONCE_FILENAME),hash:nonceHash(dir)};}finally{closeSync(dir.fd);}
}
export function validatePrivateInstallNonceBinding(keyDir:string,expectedHash:string):void{if(!/^[a-f0-9]{64}$/.test(expectedHash))failure('INSTALL_BINDING_INVALID');const dir=directory(keyDir);try{if(!timingSafeEqual(Buffer.from(nonceHash(dir),'hex'),Buffer.from(expectedHash,'hex')))failure('INSTALL_BINDING_MISMATCH');}finally{closeSync(dir.fd);}}
export function verifyPrivateInstallNonce(keyDir:string,supplied:string,expectedHash:string):void{
 if(typeof supplied!=='string'||!/^[a-f0-9]{64}$/.test(supplied))throw Object.assign(new Error('INSTALL_CREDENTIAL_REQUIRED'),{statusCode:403});if(!/^[a-f0-9]{64}$/.test(expectedHash))failure('INSTALL_BINDING_INVALID');if(hasRestoreBootstrapBlock(keyDir))failure('INSTALL_RECOVERY_BLOCKED');const dir=directory(keyDir);try{const stored=nonceHash(dir);if(!timingSafeEqual(Buffer.from(stored,'hex'),Buffer.from(expectedHash,'hex')))failure('INSTALL_BINDING_MISMATCH');if(!timingSafeEqual(Buffer.from(digest(supplied),'hex'),Buffer.from(expectedHash,'hex')))throw Object.assign(new Error('INSTALL_CREDENTIAL_INVALID'),{statusCode:403});}finally{closeSync(dir.fd);}
}
export function removePrivateInstallNonce(keyDir:string):void{const dir=directory(keyDir);try{try{nonceHash(dir);unlinkSync(anchored(dir,INSTALL_NONCE_FILENAME));if(process.platform!=='win32')fsyncSync(dir.fd);}catch(e){if((e as Error).message!=='INSTALL_CREDENTIAL_MISSING')throw e;}}finally{closeSync(dir.fd);}}
export function writeRestoreBootstrapBlock(keyDir:string):void{const dir=directory(keyDir);try{let fd:number|undefined;try{fd=openSync(anchored(dir,INSTALL_RECOVERY_BLOCK_FILENAME),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);writeFileSync(fd,JSON.stringify({version:1,state:'restored_blocked'}));fsyncSync(fd);if(process.platform!=='win32')fsyncSync(dir.fd);}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')failure('INSTALL_RECOVERY_BLOCK_INVALID');}finally{if(fd!==undefined)closeSync(fd);}}finally{closeSync(dir.fd);}if(!hasRestoreBootstrapBlock(keyDir))failure('INSTALL_RECOVERY_BLOCK_INVALID');}
