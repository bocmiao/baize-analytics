import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,chmodSync,mkdirSync,symlinkSync,unlinkSync,rmSync,existsSync,lstatSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,win32,posix} from 'node:path';
import {spawnSync} from 'node:child_process';
import {releasePath,within} from '../../scripts/package-paths.mjs';

// Publisher test: runtime hosts only receive the verified output, never this test or Node.
const root=resolve(import.meta.dirname,'../..');
const temporary=mkdtempSync(join(tmpdir(),'baize-php-package-'));
const output=join(temporary,'release'),archive=join(temporary,'release.tar.gz');
let passed=0;
const run=(args,ok=true)=>{
 const result=spawnSync(process.execPath,['scripts/package-php.mjs',...args],{cwd:root,encoding:'utf8'});
 assert.equal(result.status===0,ok,result.stderr||result.stdout);passed++;return result;
};
try{
 assert.equal(releasePath('C:\\release','C:\\release\\bin\\worker.php',win32),'bin/worker.php');passed++;
 assert.equal(releasePath('/release','/release/bin/worker.php',posix),'bin/worker.php');passed++;
 assert.equal(releasePath('/release','/release/literal\\name',posix),'literal\\name');passed++;
 assert.ok(within('C:\\source\\php\\src\\unsafe','C:\\source\\php',win32));passed++;
 assert.ok(!within('C:\\source\\php-other','C:\\source\\php',win32));passed++;
 assert.ok(!within('D:\\source\\php','C:\\source\\php',win32));passed++;
 assert.ok(within('C:\\source\\php','C:\\source\\php',win32));passed++;
 const previous=process.umask(0o077);
 try{run(['--output',output,'--archive',archive]);}finally{process.umask(previous);}
 const manifest=JSON.parse(readFileSync(join(output,'php-release-manifest.json'),'utf8'));
 assert.equal(manifest.runtime,'php');assert.equal(manifest.profile,'standard');passed++;
 assert.equal(lstatSync(output).mode&0o777,0o755);assert.equal(lstatSync(join(output,'private')).mode&0o777,0o700);passed++;
 for(const path of ['src/Governance.php','src/ProviderReports.php','third_party/maxmind-db/LICENSE','resources/bot-rules.json','resources/public_suffix_list.dat','resources/public_suffix_list.ascii.dat','public/index.html','public/tracker.js','bin/worker.php'])assert.ok(existsSync(join(output,path)),path);
 passed++;
 assert.ok(!existsSync(join(output,'node_modules'))&&!existsSync(join(output,'tests'))&&!existsSync(join(output,'private/config.php')));passed++;
 assert.ok(manifest.files.every(file=>!file.path.startsWith('private/')));passed++;
 run(['--verify',output]);
 const file=join(output,'public/index.html'),original=readFileSync(file);
 writeFileSync(file,Buffer.concat([original,Buffer.from('tampered')]));run(['--verify',output],false);writeFileSync(file,original);
 chmodSync(file,0o600);run(['--verify',output],false);chmodSync(file,0o644);
 writeFileSync(join(output,'unexpected.txt'),'extra');run(['--verify',output],false);unlinkSync(join(output,'unexpected.txt'));
 symlinkSync('public/index.html',join(output,'unexpected-link'));run(['--verify',output],false);unlinkSync(join(output,'unexpected-link'));
 chmodSync(join(output,'php-release-manifest.json'),0o600);run(['--verify',output],false);chmodSync(join(output,'php-release-manifest.json'),0o644);
 run(['--verify',output]);
 const extracted=join(temporary,'extracted');mkdirSync(extracted);
 const extraction=spawnSync('tar',['--same-permissions','-xzf',archive,'-C',extracted],{encoding:'utf8'});assert.equal(extraction.status,0,extraction.stderr);passed++;
 run(['--verify',extracted]);
 run(['--output',output],false);
 run(['--output',join(root,'php','src','unsafe-package')],false);
 run(['--output',join(temporary,'unsafe-archive'),'--archive',join(temporary,'unsafe-archive','inside.tar.gz')],false);
 console.log(JSON.stringify({suite:'php-publisher-package',passed,files:manifest.files.length,checks:['Windows/POSIX path and containment semantics','restrictive umask','complete modules/resources','no private files or Node','content/mode/extra-file/symlink rejection','tar extraction','source/output safety']}));
}finally{rmSync(temporary,{recursive:true,force:true});}
