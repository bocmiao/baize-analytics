import {mkdirSync, readdirSync, lstatSync, chmodSync, readFileSync, writeFileSync, copyFileSync, existsSync} from 'node:fs';
import {resolve, join, relative, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha256=b=>createHash('sha256').update(b).digest('hex');
const args=process.argv.slice(2),at=name=>args[args.indexOf(name)+1];
const verify=directory=>{
  const rootStat=lstatSync(directory),manifestStat=lstatSync(join(directory,'php-release-manifest.json'));
  if(!rootStat.isDirectory()||rootStat.isSymbolicLink()||!manifestStat.isFile()||manifestStat.isSymbolicLink()||(manifestStat.mode&0o777)!==0o644)throw Error('PHP_RELEASE_MANIFEST_INVALID');
  const manifest=JSON.parse(readFileSync(join(directory,'php-release-manifest.json'),'utf8'));
  if(manifest.format!=='baize-php-release-v1'||manifest.runtime!=='php'||manifest.profile!=='standard')throw Error('PHP_RELEASE_MANIFEST_INVALID');
  const actual=[],directories=[];
  const walk=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name),name=relative(directory,path);if(name==='php-release-manifest.json')continue;const stat=lstatSync(path);if(stat.isDirectory()){directories.push({path:name,mode:stat.mode&0o777});walk(path);}else if(stat.isFile())actual.push({path:name,bytes:stat.size,sha256:sha256(readFileSync(path)),mode:stat.mode&0o777});else throw Error('PHP_RELEASE_NONREGULAR_FILE');}};
  walk(directory);actual.sort((a,b)=>a.path.localeCompare(b.path));
  directories.sort((a,b)=>a.path.localeCompare(b.path));if((lstatSync(directory).mode&0o777)!==0o755||JSON.stringify(directories)!==JSON.stringify(manifest.directories)||JSON.stringify(actual)!==JSON.stringify(manifest.files))throw Error('PHP_RELEASE_CONTENT_MISMATCH');
  console.log(JSON.stringify({verified:true,files:actual.length,revision:manifest.revision,profile:manifest.profile}));
};
if(args.includes('--verify')){verify(resolve(at('--verify')));process.exit(0);}
if(!args.includes('--output'))throw Error('Usage: node scripts/package-php.mjs --output NEW_ABSOLUTE_DIRECTORY [--verify DIRECTORY]');
const output=resolve(at('--output'));
const within=(path,parent)=>path===parent||path.startsWith(parent+'/');
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
 const text=readFileSync(join(root,source),'utf8').replace(/\]\(([^\s)]+)\)/g,(match,href)=>{if(href.startsWith('#')||/^[a-z][a-z\d+.-]*:/i.test(href)||href.startsWith('//'))return match;const [pathname,suffix='']=href.split(/(?=[?#])/);const path=relative(root,resolve(root,dirname(source),pathname)).split('\\').join('/');if(path.startsWith('../'))throw Error('PHP_RELEASE_DOCUMENTATION_LINK_ESCAPE');const mapped=documentMap[path];return ']('+(mapped?mapped+suffix:'https://github.com/bocmiao/baize-analytics/blob/'+revision+'/'+path.split('/').map(encodeURIComponent).join('/')+suffix)+')';});
 writeFileSync(join(output,target),'> 本包运行与安装文件离线可用；源码和历史验收材料链接需要网络及仓库访问权限。\n\n'+text);
}
mkdirSync(join(output,'private'),{recursive:true,mode:0o700});
const files=[],directories=[];
const walk=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);const name=relative(output,path);if(entry.isDirectory()){const mode=name==='private'?0o700:0o755;chmodSync(path,mode);directories.push({path:name,mode});walk(path);}else{if(!lstatSync(path).isFile())throw Error('PHP_RELEASE_NONREGULAR_FILE');const mode=name.startsWith('bin/')?0o755:0o644;chmodSync(path,mode);files.push({path:name,bytes:lstatSync(path).size,sha256:sha256(readFileSync(path)),mode});}}};
walk(output);directories.sort((a,b)=>a.path.localeCompare(b.path));files.sort((a,b)=>a.path.localeCompare(b.path));
const dirty=execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()!=='';
writeFileSync(join(output,'php-release-manifest.json'),JSON.stringify({format:'baize-php-release-v1',runtime:'php',profile:'standard',revision,workingTreeChanges:dirty,builtAt:new Date().toISOString(),directories,requirements:['PHP >=8.3','pdo_mysql','curl','mbstring','dom','Phar','openssl','zlib','intl','bcmath or gmp for GeoIP','MySQL 8.4 or separately verified MariaDB'],files},null,2)+'\n');chmodSync(join(output,'php-release-manifest.json'),0o644);
verify(output);
if(args.includes('--archive')){const archive=resolve(at('--archive'));if(existsSync(archive))throw Error('PHP_RELEASE_ARCHIVE_EXISTS');execFileSync('tar',['-czf',archive,'-C',output,'.']);console.log(JSON.stringify({archive,sha256:sha256(readFileSync(archive)),bytes:lstatSync(archive).size}));}
