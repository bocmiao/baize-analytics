import {constants,openSync,closeSync,fstatSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {safeAncestors} from '../release/preflight.js';
/** Optional operator-provided private-source credential; never accepted over the web API. */
export function sourceAuthorization(path?:string){if(!path)return undefined;if(path!==resolve(path))throw Error('UPDATE_SOURCE_CREDENTIAL_PATH_INVALID');safeAncestors(path);const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=fstatSync(fd);if(!s.isFile()||s.nlink!==1||s.uid!==process.getuid!()||(s.mode&0o777)!==0o600||s.size>8192)throw Error('UPDATE_SOURCE_CREDENTIAL_UNTRUSTED');const token=readFileSync(fd,'utf8').trim();if(!/^[A-Za-z0-9._~+/-]{1,8000}={0,2}$/.test(token))throw Error('UPDATE_SOURCE_CREDENTIAL_INVALID');return 'Bearer '+token;}finally{closeSync(fd);}}
