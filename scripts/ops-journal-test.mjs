import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const dir=await mkdtemp(join(tmpdir(),'baize-journal-'));
const journal=join(dir,'journal.jsonl'),watermark=join(dir,'watermark.json'),backup=join(dir,'backup.jsonl');
const record=JSON.stringify({site_id:'test-site',visitor_id:'deleted-test',deleted_at:new Date().toISOString()})+'\n';
async function mark(data){await writeFile(watermark,JSON.stringify({records:data.split('\n').filter(Boolean).length,sha256:createHash('sha256').update(data).digest('hex')}));}
function check(){return spawnSync(process.execPath,[resolve('scripts/ops-validate-journal.mjs'),journal,watermark,backup],{encoding:'utf8'}).status;}
try{
 await writeFile(backup,'');await writeFile(journal,record);await mark(record);assert.equal(check(),0);
 await rm(journal);assert.notEqual(check(),0);
 await writeFile(journal,'');assert.notEqual(check(),0); // reset journal cannot match independently persisted deletion watermark.
 await writeFile(journal,record.slice(0,-1));await mark(record.slice(0,-1));assert.notEqual(check(),0);
 await writeFile(journal,record);await mark(record);await writeFile(backup,record+'extra\n');assert.notEqual(check(),0);
 console.log('Deletion journal missing/reset/truncation/older-than-snapshot checks passed.');
}finally{await rm(dir,{recursive:true,force:true});}
