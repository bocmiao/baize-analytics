import os, subprocess, hashlib, json
from pathlib import Path
repo=Path(os.environ.get('SOURCE_REPOSITORY',str(Path(__file__).resolve().parents[2]))).resolve();root=Path(os.environ['APP_ROOT']).resolve();sha=os.environ['FROZEN_SOURCE_SHA']
actual=subprocess.check_output(['git','-C',str(repo),'rev-parse',sha+'^{commit}'],text=True).strip()
if actual!=sha: raise SystemExit('Exact full commit SHA required')
entries=subprocess.check_output(['git','-C',str(repo),'ls-tree','-rz',sha]).split(b'\0');count=0
for entry in entries:
 if not entry: continue
 meta,name=entry.split(b'\t',1);mode,kind,blob=meta.decode().split();path=root/os.fsdecode(name)
 if kind!='blob': raise SystemExit('Unsupported tracked entry type')
 if mode=='120000':
  if not path.is_symlink():raise SystemExit('Archive symlink mismatch: '+os.fsdecode(name))
  data=os.fsencode(os.readlink(path))
 else:
  if not path.is_file() or path.is_symlink():raise SystemExit('Archive file missing/type mismatch: '+os.fsdecode(name))
  data=path.read_bytes()
 digest=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
 if digest!=blob:raise SystemExit('Archive content mismatch: '+os.fsdecode(name))
 count+=1
print(json.dumps({'exit':0,'sourceCommit':sha,'trackedFilesVerified':count,'method':'git-ls-tree/blob-hash; untracked dependency symlink excluded'}))
