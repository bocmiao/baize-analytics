#!/usr/bin/env python3
"""Publish signed OCI layer metadata/blobs from verified local image IDs, without pushing."""
import argparse,hashlib,json,pathlib,re,subprocess,tarfile,gzip,os
parser=argparse.ArgumentParser();parser.add_argument('--base-image',required=True);parser.add_argument('--target-image',required=True);parser.add_argument('--output',required=True);parser.add_argument('--key-file',required=True);parser.add_argument('--key-id',required=True);parser.add_argument('--label',required=True);args=parser.parse_args()
for value in [args.base_image,args.target_image]:
 if not re.fullmatch(r'sha256:[a-f0-9]{64}',value):raise SystemExit('Immutable local image IDs required')
out=pathlib.Path(args.output).resolve();key=pathlib.Path(args.key_file).resolve();stat=key.lstat()
if not key.is_file() or key.is_symlink() or stat.st_nlink!=1 or stat.st_uid!=os.getuid() or stat.st_mode&0o777!=0o600 or stat.st_size>8192:raise SystemExit('Private signing-key file required')
if out.exists():raise SystemExit('Output must be new')
out.mkdir(mode=0o700,parents=True);(out/'blobs').mkdir(mode=0o700)
def sha(b):return hashlib.sha256(b).hexdigest()
def image(image_id,name):
 meta=json.loads(subprocess.check_output(['docker','image','inspect',image_id]))[0]
 if meta['Architecture']!='amd64' or meta['Os']!='linux':raise SystemExit('linux/amd64 image required')
 labels=meta['Config'].get('Labels',{});profile=labels.get('io.baize.profile');revision=labels.get('io.baize.release-id');schema=labels.get('io.baize.schema-fingerprint')
 if profile not in ['standard','lite'] or not re.fullmatch('[a-f0-9]{40}',revision or '') or not re.fullmatch('[a-f0-9]{64}',schema or ''):raise SystemExit('Publisher-bound revision/profile/schema labels required')
 archive=out/(name+'-local-image.tar');subprocess.run(['docker','image','save','--output',str(archive),image_id],check=True)
 with tarfile.open(archive)as tar:
  index=json.load(tar.extractfile('manifest.json'))
  if len(index)!=1:raise SystemExit('Single immutable image required')
  item=index[0];config=tar.extractfile(item['Config']).read();config_hash=sha(config)
  if 'sha256:'+config_hash!=image_id:raise SystemExit('Image config ID mismatch')
  cfg=json.loads(config);(out/'blobs'/config_hash).write_bytes(config);layers=[];descriptors=[]
  for n,path in enumerate(item['Layers']):
   raw=tar.extractfile(path).read();diff='sha256:'+sha(raw)
   if diff!=cfg['rootfs']['diff_ids'][n]:raise SystemExit('Local layer rootfs mismatch')
   compressed=gzip.compress(raw,mtime=0);digest='sha256:'+sha(compressed);(out/'blobs'/digest[7:]).write_bytes(compressed);layers.append({'compressedDigest':digest,'uncompressedDigest':diff,'compressedBytes':len(compressed),'uncompressedBytes':len(raw)});descriptors.append({'mediaType':'application/vnd.docker.image.rootfs.diff.tar.gzip','digest':digest,'size':len(compressed)})
  manifest=json.dumps({'schemaVersion':2,'mediaType':'application/vnd.docker.distribution.manifest.v2+json','config':{'mediaType':'application/vnd.docker.container.image.v1+json','digest':image_id,'size':len(config)},'layers':descriptors},separators=(',',':'))
  return {'releaseId':revision,'manifestDigest':'sha256:'+sha(manifest.encode()),'manifest':manifest,'profile':profile,'schemaFingerprint':schema,'nodeMajor':24,'layers':layers}
base=image(args.base_image,'base');target=image(args.target_image,'target')
if base['profile']!=target['profile'] or base['schemaFingerprint']!=target['schemaFingerprint']:raise SystemExit('Schema/profile changes require separate migration; no automatic update')
delta={'format':'baize-image-layer-update-v1','base':{k:base[k]for k in ['manifestDigest','releaseId','schemaFingerprint']},'target':target,'label':args.label,'notes':['镜像层增量，非文件级补丁；数据库结构不变。']};body=json.dumps(delta,separators=(',',':'),ensure_ascii=False);body_file=out/'unsigned-body.json';body_file.write_text(body,encoding='utf-8');os.chmod(body_file,0o600)
node="import{readFileSync}from'node:fs';import{createPrivateKey,sign}from'node:crypto';const[b,k,id]=process.argv.slice(1),key=createPrivateKey(readFileSync(k));if(key.asymmetricKeyType!=='ed25519')throw Error('Ed25519 required');const body=readFileSync(b,'utf8');console.log(JSON.stringify({body,keyId:id,signature:sign(null,Buffer.from(body),key).toString('base64')}));"
signed=subprocess.check_output(['node','--input-type=module','-e',node,str(body_file),str(key),args.key_id]);(out/'latest.json').write_bytes(signed);os.chmod(out/'latest.json',0o600)
print(json.dumps({'releaseId':target['releaseId'],'manifestDigest':target['manifestDigest'],'output':str(out),'notPushed':True,'signingPrivateKeyNotCopied':True},indent=2))
