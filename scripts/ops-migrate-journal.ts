/** Explicit, stopped-application legacy migration. Never used by restore. */
import {createPool} from '../src/server/db.js';
import {readFile,open,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const dir=resolve(process.env.DATA_DIR??'data'),path=resolve(dir,'tombstones.jsonl');
const data=await readFile(path);const text=data.toString('utf8');if(text&&!text.endsWith('\n'))throw new Error('Truncated journal');
const records=text.split('\n').filter(Boolean).map(line=>JSON.parse(line));
const pool=createPool(process.env.DATABASE_URL??'postgresql://baize_dev@127.0.0.1:5432/baize_dev');
try{for(const row of(await pool.query('SELECT site_id,visitor_id FROM tombstones')).rows)if(!records.some(r=>r.site_id===row.site_id&&r.visitor_id===row.visitor_id&&typeof r.deleted_at==='string'&&Number.isFinite(Date.parse(r.deleted_at))))throw new Error('DB tombstone missing in independent journal');
for(const row of(await pool.query('SELECT site_id,visitor_id,user_id,started_at FROM identity_tombstones')).rows)if(!records.some(r=>r.site_id===row.site_id&&r.visitor_id===row.visitor_id&&r.user_id===row.user_id&&Date.parse(r.started_at)===new Date(row.started_at).getTime()))throw new Error('Identity tombstone missing in independent journal');
for(const r of records)if(!r.site_id||!r.visitor_id||!Number.isFinite(Date.parse(r.deleted_at)))throw new Error('Invalid journal record');
const marker=resolve(dir,'tombstones.watermark.json');try{await readFile(marker);throw new Error('Watermark already exists; migration refused');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const temp=resolve(dir,`watermark-${randomUUID()}.tmp`),f=await open(temp,'wx',0o600);try{await f.writeFile(JSON.stringify({records:records.length,sha256:createHash('sha256').update(data).digest('hex')}));await f.sync();}finally{await f.close();}await rename(temp,marker);const d=await open(dir,'r');try{await d.sync();}finally{await d.close();}console.log(JSON.stringify({migrated:true,verifiedRecords:records.length}));
}finally{await pool.end();}
