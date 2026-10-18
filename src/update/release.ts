import {readFileSync,lstatSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {verifyRelease,safeAncestors} from '../release/preflight.js';
import {parseRelease,digest} from './protocol.js';

/** PHP releases have no image identity. All instance state stays outside code. */
export function verifyUpdateRelease(root:string){
 root=resolve(root);safeAncestors(root);
 const path=join(root,'release-manifest.json');safeAncestors(path);const stat=lstatSync(path);
 if(!stat.isFile()||stat.nlink!==1||stat.size>16*1024*1024)throw Error('UPDATE_RELEASE_MANIFEST_INVALID');
 const m=parseRelease(readFileSync(path,'utf8'));
 if(m.variant!=='php-fpm'){verifyRelease(root);return m;}
 const files=new Map(m.files.map(e=>[e.path,e])),dirs=new Map(m.directories.map(e=>[e.path,e]));
 const walk=(prefix='')=>{for(const name of readdirSync(join(root,prefix))){const rel=prefix?prefix+'/'+name:name,p=join(root,rel),s=lstatSync(p);
  if(rel==='release-manifest.json')continue;
  if(rel==='private'||rel.startsWith('private/')||s.isSymbolicLink())throw Error('UPDATE_PHP_PRIVATE_OR_LINK_FORBIDDEN');
  if(s.isDirectory()){if(!dirs.has(rel)||(s.mode&0o777)!==dirs.get(rel)!.mode)throw Error('UPDATE_RELEASE_DIRECTORY_INVALID');dirs.delete(rel);walk(rel);}
  else{const e=files.get(rel);if(!e||e.type==='symlink'||!s.isFile()||s.nlink!==1||s.size!==e.bytes||(s.mode&0o777)!==e.mode||digest(readFileSync(p))!==e.sha256)throw Error('UPDATE_RELEASE_CONTENT_MISMATCH');files.delete(rel);}
 }};walk();if(files.size||dirs.size)throw Error('UPDATE_RELEASE_CONTENT_MISSING');
 for(const required of ['bootstrap.php','public/index.php','public/index.html','bin/worker.php','bin/update-ops.php'])if(!m.files.some(e=>e.path===required))throw Error('UPDATE_PHP_RUNTIME_INCOMPLETE');
 return m;
}
