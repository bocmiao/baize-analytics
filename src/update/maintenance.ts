import {existsSync,readFileSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {digest} from './protocol.js';
export function maintenanceActive(){
 const path=process.env.BAIZE_UPDATE_GATE;if(!path)return false;
 try{if(!existsSync(path))return false;const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>4096)return true;return JSON.parse(readFileSync(path,'utf8')).maintenance!==false;}catch{return true;}
}
export function runningUpdateIdentity(){
 const revision=process.env.BAIZE_BUILD_REVISION,hash=process.env.BAIZE_UPDATE_MANIFEST_SHA256;if(process.env.BAIZE_DEPLOYMENT_MODE==='docker-managed'&&revision&&/^[a-f0-9]{40}$/.test(revision)&&hash&&/^[a-f0-9]{64}$/.test(hash))return {revision,manifestSha256:hash,launchId:process.env.BAIZE_UPDATE_LAUNCH_ID??null};
 try{const path=join(process.cwd(),'release-manifest.json'),stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16*1024*1024)return undefined;const bytes=readFileSync(path,'utf8'),m=JSON.parse(bytes);if(!/^[a-f0-9]{40}$/.test(m.revision))return undefined;return {revision:m.revision,manifestSha256:digest(bytes),launchId:process.env.BAIZE_UPDATE_LAUNCH_ID??null};}catch{return undefined;}
}
export function updateSocketPath(){const path=process.env.BAIZE_UPDATE_SOCKET;if(!path)return undefined;if(path!==resolve(path))throw Error('UPDATE_SOCKET_PATH_INVALID');return path;}
