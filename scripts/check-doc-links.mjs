import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {dirname,isAbsolute,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export function documentationTargets(source) {
 const targets=[];
 // Fenced examples and inline code are not navigable document links.
 const prose=source.replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm,match=>match.replace(/[^\n]/g,' ')).replace(/`[^`\n]+`/g,match=>' '.repeat(match.length));
 const add=(target,index)=>targets.push({target:target.replace(/^<|>$/g,''),line:prose.slice(0,index).split('\n').length});
 for(const match of prose.matchAll(/!?\[[^\]\n]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^\n]*?["'])?\s*\)/g))add(match[1],match.index);
 for(const match of prose.matchAll(/^\s{0,3}\[[^\]\n]+\]:\s*(<[^>]+>|[^\s]+)(?:\s+["'][^\n]*?["'])?\s*$/gm))add(match[1],match.index);
 for(const match of prose.matchAll(/<(?:img|a)\s[^>]*?(?:src|href)=["']([^"']+)["'][^>]*>/gi))add(match[1],match.index);
 return targets;
}

export function checkDocumentationLinks(root) {
 root=resolve(root);
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}).split('\0').filter(path=>/\.(md|markdown)$/i.test(path)&&existsSync(resolve(root,path)));
 const broken=[];let checked=0;
 for(const path of files){
  for(const {target,line} of documentationTargets(readFileSync(resolve(root,path),'utf8'))){
   if(!target||target.startsWith('#')||target.startsWith('//')||/^[a-z][a-z\d+.-]*:/i.test(target))continue;
   const pathname=target.split(/[?#]/,1)[0];if(!pathname)continue;
   let decoded;try{decoded=decodeURIComponent(pathname);}catch{broken.push({path,line,target,reason:'invalid URL encoding'});continue;}
   const resolved=resolve(dirname(resolve(root,path)),decoded),key=relative(root,resolved).split(sep).join('/');checked++;
   if(isAbsolute(decoded)||key==='..'||key.startsWith('../'))broken.push({path,line,target,reason:'outside repository'});
   else if(!existsSync(resolved))broken.push({path,line,target,reason:'missing target'});
  }
 }
 return {documents:files.length,relativeLinks:checked,broken};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=checkDocumentationLinks(process.argv[2]??'.');
 console.log(JSON.stringify(result,null,2));
 if(result.broken.length)process.exitCode=1;
}
