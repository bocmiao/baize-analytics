import {mkdirSync, readdirSync, lstatSync, chmodSync, readFileSync, writeFileSync, copyFileSync, existsSync} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {releasePath, within} from './package-paths.mjs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {gunzipSync, gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha256=b=>createHash('sha256').update(b).digest('hex');
const args=process.argv.slice(2),at=name=>args[args.indexOf(name)+1];
// Windows 表达不了 POSIX 权限位（chmod 只切只读位），stat 恒为 0666/0777。
// 发布包必须带 Linux 语义的权限，所以在 Windows 上按"意图"比较，并把归档头部重写。
const posix=process.platform!=='win32';
const intendedFileMode=name=>name.startsWith('bin/')?0o755:0o644;
const intendedDirMode=name=>name==='private'?0o700:0o755;
const readStr=(buffer,offset,length)=>{let end=offset;while(end<offset+length&&buffer[end]!==0)end++;return buffer.toString('utf8',offset,end);};
const normalizeArchiveModes=archive=>{
  const buffer=Buffer.from(gunzipSync(readFileSync(archive)));
  let offset=0;
  while(offset+512<=buffer.length){
    if(buffer.subarray(offset,offset+512).every(byte=>byte===0))break;
    const name=readStr(buffer,offset,100);
    const prefix=buffer.toString('ascii',offset+257,offset+262)==='ustar'?readStr(buffer,offset+345,155):'';
    const full=(prefix?prefix+'/':'')+name;
    const type=buffer[offset+156];
    const size=parseInt(readStr(buffer,offset+124,12).trim()||'0',8)||0;
    if(type===0x30||type===0x35||type===0){
      const path=full.replace(/^\.\//,'').replace(/\/+$/,'');
      const directory=type===0x35||path==='';
      const mode=directory?intendedDirMode(path):intendedFileMode(path);
      buffer.write(mode.toString(8).padStart(7,'0'),offset+100,7,'ascii');
      buffer[offset+107]=0;
      buffer.fill(0x20,offset+148,offset+156);
      let sum=0;for(let i=0;i<512;i+=1)sum+=buffer[offset+i];
      buffer.write(sum.toString(8).padStart(6,'0')+'\0 ',offset+148,8,'ascii');
    }
    offset+=512+Math.ceil(size/512)*512;
  }
  writeFileSync(archive,gzipSync(buffer,{level:9}));
};
const verify=directory=>{
  const rootStat=lstatSync(directory),manifestStat=lstatSync(join(directory,'php-release-manifest.json'));
  if(!rootStat.isDirectory()||rootStat.isSymbolicLink()||!manifestStat.isFile()||manifestStat.isSymbolicLink()||(posix&&(manifestStat.mode&0o777)!==0o644))throw Error('PHP_RELEASE_MANIFEST_INVALID');
  const manifest=JSON.parse(readFileSync(join(directory,'php-release-manifest.json'),'utf8'));
  if(manifest.format!=='baize-php-release-v1'||manifest.runtime!=='php'||manifest.profile!=='standard')throw Error('PHP_RELEASE_MANIFEST_INVALID');
  const actual=[],directories=[];
  const walk=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name),name=releasePath(directory,path);if(name==='php-release-manifest.json')continue;const stat=lstatSync(path);if(stat.isDirectory()){directories.push({path:name,mode:posix?(stat.mode&0o777):intendedDirMode(name)});walk(path);}else if(stat.isFile())actual.push({path:name,bytes:stat.size,sha256:sha256(readFileSync(path)),mode:posix?(stat.mode&0o777):intendedFileMode(name)});else throw Error('PHP_RELEASE_NONREGULAR_FILE');}};
  walk(directory);actual.sort((a,b)=>a.path.localeCompare(b.path));
  directories.sort((a,b)=>a.path.localeCompare(b.path));if((posix&&(lstatSync(directory).mode&0o777)!==0o755)||JSON.stringify(directories)!==JSON.stringify(manifest.directories)||JSON.stringify(actual)!==JSON.stringify(manifest.files))throw Error('PHP_RELEASE_CONTENT_MISMATCH');
  console.log(JSON.stringify({verified:true,files:actual.length,revision:manifest.revision,profile:manifest.profile}));
};
if(args.includes('--verify')){verify(resolve(at('--verify')));process.exit(0);}
if(!args.includes('--output'))throw Error('Usage: node scripts/package-php.mjs --output NEW_ABSOLUTE_DIRECTORY [--verify DIRECTORY]');
const output=resolve(at('--output'));
if(output===root||['php','dist','public','docs'].some(name=>within(output,join(root,name))))throw Error('PHP_RELEASE_OUTPUT_INSIDE_SOURCE');
if(args.includes('--archive')&&within(resolve(at('--archive')),output))throw Error('PHP_RELEASE_ARCHIVE_INSIDE_OUTPUT');
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(existsSync(output))throw Error('PHP_RELEASE_OUTPUT_EXISTS');
if(!existsSync(join(root,'dist/web/index.html'))||!existsSync(join(root,'public/tracker.js')))throw Error('BUILD_FRONTEND_AND_TRACKER_FIRST');
for(const name of ['App','Auth','Installer','Sites','Collect','Worker','Analytics','AnalysisEngine','Governance','Operations','External','ProviderReports','ManualSearch','SSO','GeoIP','Diagnostics','Keyring','Maintenance','Mcp','Annotations'])if(!existsSync(join(root,'php/src',name+'.php')))throw Error('PHP_RELEASE_MODULE_MISSING:'+name);
mkdirSync(output,{recursive:true});chmodSync(output,0o755);
const copy=(source,target)=>{
 const stat=lstatSync(source);if(stat.isSymbolicLink()||(!stat.isDirectory()&&!stat.isFile()))throw Error('PHP_RELEASE_NONREGULAR_SOURCE');
 if(stat.isDirectory()){mkdirSync(target,{recursive:true});for(const child of readdirSync(source))copy(join(source,child),join(target,child));}
 else {mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target);}
};
for(const name of ['src','bin','migrations','deploy','resources','third_party'])if(existsSync(join(root,'php',name)))copy(join(root,'php',name),join(output,name));
copy(join(root,'php/bootstrap.php'),join(output,'bootstrap.php'));
mkdirSync(join(output,'public'),{recursive:true});
for(const name of ['index.php','router.php','install.php','.htaccess'])if(existsSync(join(root,'php/public',name)))copy(join(root,'php/public',name),join(output,'public',name));
copy(join(root,'dist/web'),join(output,'public'));
for(const name of readdirSync(join(root,'public')).filter(n=>/^tracker(?:[.\w-]*)\.(?:js|json|txt)(?:\.gz)?$/.test(n)))copy(join(root,'public',name),join(output,'public',name));
copy(join(root,'LICENSE'),join(output,'LICENSE'));
const documentMap={'docs/PHP_INSTALLATION.md':'README.md','docs/PHP_VALIDATION_20261015.md':'VALIDATION.md'};
for(const [source,target] of Object.entries(documentMap)){
 const text=readFileSync(join(root,source),'utf8').replace(/\]\(([^\s)]+)\)/g,(match,href)=>{if(href.startsWith('#')||/^[a-z][a-z\d+.-]*:/i.test(href)||href.startsWith('//'))return match;const [pathname,suffix='']=href.split(/(?=[?#])/);const path=releasePath(root,resolve(root,dirname(source),pathname));if(path.startsWith('../'))throw Error('PHP_RELEASE_DOCUMENTATION_LINK_ESCAPE');const mapped=documentMap[path];return ']('+(mapped?mapped+suffix:'https://github.com/bocmiao/baize-analytics/blob/'+revision+'/'+path.split('/').map(encodeURIComponent).join('/')+suffix)+')';});
 writeFileSync(join(output,target),'> 本包运行与安装文件离线可用；源码和历史验收材料链接需要网络及仓库访问权限。\n\n'+text);
}
mkdirSync(join(output,'private'),{recursive:true,mode:0o700});
const files=[],directories=[];
const walk=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);const name=releasePath(output,path);if(entry.isDirectory()){const mode=name==='private'?0o700:0o755;chmodSync(path,mode);directories.push({path:name,mode});walk(path);}else{if(!lstatSync(path).isFile())throw Error('PHP_RELEASE_NONREGULAR_FILE');const mode=name.startsWith('bin/')?0o755:0o644;chmodSync(path,mode);files.push({path:name,bytes:lstatSync(path).size,sha256:sha256(readFileSync(path)),mode});}}};
walk(output);directories.sort((a,b)=>a.path.localeCompare(b.path));files.sort((a,b)=>a.path.localeCompare(b.path));
const dirty=execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()!=='';
writeFileSync(join(output,'php-release-manifest.json'),JSON.stringify({format:'baize-php-release-v1',runtime:'php',profile:'standard',revision,workingTreeChanges:dirty,builtAt:new Date().toISOString(),directories,requirements:['PHP >=8.3','pdo_mysql','curl','mbstring','dom','Phar','openssl','zlib','intl','bcmath or gmp for GeoIP','MySQL 8.4 or separately verified MariaDB'],files},null,2)+'\n');chmodSync(join(output,'php-release-manifest.json'),0o644);
verify(output);
if(args.includes('--archive')){const archive=resolve(at('--archive'));if(existsSync(archive))throw Error('PHP_RELEASE_ARCHIVE_EXISTS');execFileSync('tar',['-czf',archive,'-C',output,'.']);if(!posix)normalizeArchiveModes(archive);console.log(JSON.stringify({archive,sha256:sha256(readFileSync(archive)),bytes:lstatSync(archive).size}));}
