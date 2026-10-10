import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const directory=await mkdtemp(join(tmpdir(),'baize-distribution-check-'));
execFileSync(process.execPath,['--import','tsx','scripts/build-tracker.ts'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/package-distributions.mjs',directory],{stdio:'inherit'});
execFileSync('python3',['-c',`import pathlib,sys,zipfile
root=pathlib.Path.cwd();out=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(out/'baize-wordpress.zip') as z:
 assert set(z.namelist())=={'baize/baize.php','baize/README.md','baize/LICENSE'}
 assert z.read('baize/LICENSE')==(root/'LICENSE').read_bytes()
with zipfile.ZipFile(out/'baize-tracker-browser.zip') as z:
 assert z.read('tracker/tracker.LICENSE.txt')==(root/'packages/tracker/LICENSE').read_bytes()
 for name in z.namelist():
  if name.endswith('.js'):
   assert (root/'packages/tracker/LICENSE').read_bytes().strip() in z.read(name)
   assert b'tracker.LICENSE.txt' in z.read(name)
with zipfile.ZipFile(out/'baize-tracker-source.zip') as z:z.extractall(out/'isolated')
`,directory],{stdio:'inherit'});
const config=join(directory,'isolated/tracker/tsconfig.json');
await writeFile(config,JSON.stringify({compilerOptions:{target:'ES2022',module:'ESNext',moduleResolution:'Bundler',lib:['ES2022','DOM','DOM.Iterable'],strict:true,noEmit:true,types:[]},files:['src/index.ts','src/mini-program.ts']}));
execFileSync(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'--project',config],{stdio:'inherit'});
const sbom=JSON.parse(await readFile('docs/licenses/sbom.cyclonedx.json','utf8'));
for(const name of ['tldts','tldts-core'])assert(sbom.components.some(c=>c.name===name&&c.version==='7.4.18'));
console.log('Actual JS/ZIP full-notice assertions, isolated exported SDK type checks and tldts SBOM checks passed. No npm publication or Docker validation claimed.');
