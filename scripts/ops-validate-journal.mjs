import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const [journalPath,watermarkPath,backupJournalPath]=process.argv.slice(2);
if(!journalPath||!watermarkPath)throw Error('Journal and independent watermark required');
const data=await readFile(journalPath);
const watermark=JSON.parse(await readFile(watermarkPath,'utf8'));
const lines=data.toString('utf8').split('\n').filter(Boolean);
if(data.length&&!data.toString('utf8').endsWith('\n'))throw Error('Deletion journal truncated');
for(const line of lines){const record=JSON.parse(line);if(typeof record.site_id!=='string'||!record.site_id||typeof record.visitor_id!=='string'||!record.visitor_id||typeof record.deleted_at!=='string'||!Number.isFinite(Date.parse(record.deleted_at)))throw Error('Invalid deletion journal record');if(record.source==='identity-segment'&&(!record.user_id||!record.started_at||!Number.isFinite(Date.parse(record.started_at))||(record.ended_at!=null&&record.ended_at!=='infinity'&&(!Number.isFinite(Date.parse(record.ended_at))||Date.parse(record.ended_at)<=Date.parse(record.started_at)))))throw Error('Invalid identity deletion interval');}
if(!Number.isSafeInteger(watermark.records)||watermark.records<0||!(/^[a-f0-9]{64}$/).test(watermark.sha256)||watermark.records!==lines.length||watermark.sha256!==createHash('sha256').update(data).digest('hex'))throw Error('Deletion journal does not match independent watermark');
if(backupJournalPath){const prefix=await readFile(backupJournalPath);if(data.length<prefix.length||!data.subarray(0,prefix.length).equals(prefix))throw Error('Latest independent deletion journal does not extend backup journal');}
console.log(JSON.stringify({verified:true,records:lines.length}));
