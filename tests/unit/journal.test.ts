import {it,expect} from 'vitest';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {initializeJournal} from '../../src/server/deletion.js';
it('recovery never creates a replacement for a missing independent deletion journal',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'baize-journal-required-'));try{await expect(initializeJournal(dir,true)).rejects.toThrow('missing');await expect(readFile(join(dir,'tombstones.jsonl'))).rejects.toMatchObject({code:'ENOENT'});}finally{await rm(dir,{recursive:true,force:true});}
});
it('rejects a reset journal and accepts only a complete crash extension of the acknowledged prefix',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'baize-journal-fence-'));try{
  await initializeJournal(dir);const line=JSON.stringify({site_id:'test',visitor_id:'test',user_id:null,deleted_at:new Date().toISOString(),source:'request'})+'\n';
  await writeFile(join(dir,'tombstones.jsonl'),line);await expect(initializeJournal(dir,true)).rejects.toThrow('watermark');
  expect((await initializeJournal(dir)).records).toBe(1);expect((await initializeJournal(dir,true)).records).toBe(1);
  await writeFile(join(dir,'tombstones.jsonl'),'');await expect(initializeJournal(dir)).rejects.toThrow('watermark');
  await writeFile(join(dir,'tombstones.jsonl'),line.slice(0,-1));await expect(initializeJournal(dir)).rejects.toThrow('truncated');
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('requires a pre-existing watermark for a nonempty legacy log and validates identity interval bounds',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'baize-journal-legacy-'));try{
  const line=JSON.stringify({site_id:'test',visitor_id:'test',user_id:'account',deleted_at:new Date().toISOString(),source:'identity-segment',started_at:'2026-01-02T00:00:00Z',ended_at:'2026-01-01T00:00:00Z'})+'\n';
  await writeFile(join(dir,'tombstones.jsonl'),line);await expect(initializeJournal(dir)).rejects.toThrow('interval');
  await writeFile(join(dir,'tombstones.jsonl'),line.replace('identity-segment','request'));await expect(initializeJournal(dir)).rejects.toThrow('watermark');
 }finally{await rm(dir,{recursive:true,force:true});}
});
