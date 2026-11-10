import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const output=resolve(process.argv[2]??'.baize/distributions');
await mkdir(output,{recursive:true});
const license=await readFile('packages/tracker/LICENSE','utf8');
if(await readFile('public/tracker.LICENSE.txt','utf8')!==license)throw Error('Run npm run build:tracker first; full MIT notice must match');
execFileSync('python3',['-c',`import sys,pathlib,zipfile
root=pathlib.Path.cwd();out=pathlib.Path(sys.argv[1])
def archive(name,entries):
 with zipfile.ZipFile(out/name,'w',zipfile.ZIP_DEFLATED) as z:
  for source,target in entries:
   entry=zipfile.ZipInfo(target,date_time=(2026,1,1,0,0,0));entry.external_attr=0o100644<<16;entry.compress_type=zipfile.ZIP_DEFLATED
   z.writestr(entry,(root/source).read_bytes())
archive('baize-wordpress.zip',[(f'plugins/wordpress/{n}',f'baize/{n}') for n in ['baize.php','README.md','LICENSE']])
names=['tracker','tracker-min','tracker-vitals','tracker-replay','tracker-heatmap','tracker-consent','tracker-visual']
archive('baize-tracker-browser.zip',[(f'public/{n}.js',f'tracker/{n}.js') for n in names]+[('public/tracker.LICENSE.txt','tracker/tracker.LICENSE.txt'),('packages/tracker/README.md','tracker/README.md')])
source=[(str(p),str(p.relative_to(root/'packages'))) for p in sorted((root/'packages/tracker').rglob('*')) if p.is_file() and 'node_modules' not in p.parts]
archive('baize-tracker-source.zip',[(str(pathlib.Path(p).relative_to(root)),n) for p,n in source])
`,output],{stdio:'inherit'});
console.log('Local private distribution archives created; no publishing performed.');
