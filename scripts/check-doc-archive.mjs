import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {posix,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const sha256=value=>createHash('sha256').update(value).digest('hex');
export function checkArchive(root) {
 root=resolve(root);
 const manifest=JSON.parse(readFileSync(resolve(root,'docs/archive/moves-20261015.json'),'utf8'));
 const failures=[],moves=new Map(manifest.moves.map(item=>[item.oldPath,item.newPath]));
 if(manifest.version!==1||manifest.movedDocuments!==manifest.moves.length||moves.size!==manifest.moves.length||new Set(moves.values()).size!==moves.size||!/^[a-f0-9]{40}$/.test(manifest.sourceRevision))throw Error('ARCHIVE_MANIFEST_INVALID');
 for(const item of manifest.moves){
  if(!item.oldPath.startsWith('docs/')||item.oldPath.startsWith('docs/archive/')||!/^docs\/archive\/(delivery|validation|ui|handoffs|reviews)\/[^/]+\.md$/.test(item.newPath))throw Error('ARCHIVE_PATH_INVALID');
  const source=execFileSync('git',['show',`${manifest.sourceRevision}:${item.oldPath}`],{cwd:root,maxBuffer:16*1024*1024});
  const gitBlob=execFileSync('git',['rev-parse',`${manifest.sourceRevision}:${item.oldPath}`],{cwd:root,encoding:'utf8'}).trim();
  if(gitBlob!==item.sourceGitBlob||sha256(source)!==item.sourceSha256)failures.push({path:item.oldPath,reason:'source witness mismatch'});
  if(existsSync(resolve(root,item.oldPath)))failures.push({path:item.oldPath,reason:'old path still exists'});
  if(!existsSync(resolve(root,item.newPath))){failures.push({path:item.newPath,reason:'archived document missing'});continue;}
  const actual=readFileSync(resolve(root,item.newPath));
  if(sha256(actual)!==item.archiveSha256)failures.push({path:item.newPath,reason:'archive witness mismatch'});
  let expected=source.toString('utf8').replace(/(\]\()([^\s)]+)([^)]*\))/g,(match,prefix,target,suffix)=>{
   if(target.startsWith('#')||target.startsWith('//')||/^[a-z][a-z\d+.-]*:/i.test(target))return match;
   const [,pathname,extra]=target.match(/^([^?#]*)(.*)$/);if(!pathname)return match;
   const original=posix.normalize(posix.join(posix.dirname(item.oldPath),pathname));
   const targetPath=moves.get(original)??original;
   return prefix+posix.relative(posix.dirname(item.newPath),targetPath)+(pathname.endsWith('/')?'/':'')+extra+suffix;
  });
  for(const [oldPath,newPath] of moves)expected=expected.replaceAll(oldPath,newPath);
  const status=posix.relative(posix.dirname(item.newPath),'docs/STATUS.md'),index=posix.relative(posix.dirname(item.newPath),'docs/archive/README.md');
  const banner=`\n> 历史记录：本文的“当前／最新”、测试结果与下载信息仅指其日期和版本。当前入口见 [项目状态](${status})；原路径映射见 [归档索引](${index})。原始失败、未测项及证据保留。\n`;
  const firstLine=expected.indexOf('\n')+1;expected=expected.slice(0,firstLine)+banner+expected.slice(firstLine);
  if(expected!==actual.toString('utf8'))failures.push({path:item.newPath,reason:'body changed beyond historical notice and path rewrites'});
 }
 return {sourceRevision:manifest.sourceRevision,movedDocuments:manifest.moves.length,failures};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=checkArchive(process.argv[2]??'.');console.log(JSON.stringify(result,null,2));if(result.failures.length)process.exitCode=1;
}
