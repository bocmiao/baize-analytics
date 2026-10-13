// Lite executes compiled maintenance modules; it does not need the standard TS maintenance runtime.
import {mkdirSync,existsSync,cpSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {copyRuntimeEntry} from './runtime-stage.mjs';
export function stageLiteRuntime(sourceArgument='.',targetArgument='/runtime'){
 const source=resolve(sourceArgument),target=resolve(targetArgument);
 if(target===source||!relative(source,target).startsWith('..')||existsSync(target))throw Error('New Lite runtime destination outside source required');
 mkdirSync(target,{recursive:true});
 for(const name of ['dist','public','node_modules','db','package.json','package-lock.json','LICENSE'])copyRuntimeEntry(resolve(source,name),resolve(target,name));
 mkdirSync(resolve(target,'scripts'));for(const name of ['release-start.sh','release-ops.sh'])cpSync(resolve(source,'scripts',name),resolve(target,'scripts',name));
 execFileSync('npm',['prune','--omit=dev','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:target,stdio:'inherit'});
 for(const name of ['package.json','package-lock.json'])cpSync(resolve(source,name),resolve(target,name));
 if(existsSync(resolve(target,'node_modules/tsx/package.json'))||existsSync(resolve(target,'node_modules/esbuild/package.json')))throw Error('Lite must not inherit standard maintenance build tools');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))stageLiteRuntime(process.argv[2],process.argv[3]);
