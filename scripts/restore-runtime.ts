import { createPool,migrate } from '../src/server/db.js';
import { replayDeletionJournal } from '../src/server/deletion.js';
import { runWorkerOnce } from '../src/server/worker.js';
import { Redis } from 'ioredis';
import { resolve } from 'node:path';
const url=new URL(process.env.DATABASE_URL??'postgresql://baize_dev@127.0.0.1:5432/baize_dev');if(process.env.RESTORE_DATABASE){if(!/^baize_restore_[a-zA-Z0-9_]+$/.test(process.env.RESTORE_DATABASE))throw new Error('Unsafe restore database');url.pathname='/'+process.env.RESTORE_DATABASE;}
const pool=createPool(url.toString());const dir=resolve(process.env.DATA_DIR??'data');const redis=process.env.REDIS_URL?new Redis(process.env.REDIS_URL):null;
try{await migrate(pool);const result=await replayDeletionJournal(pool,dir,resolve(dir,'restore-backup-tombstones.jsonl'));await pool.query('UPDATE aggregation_state SET epoch=gen_random_uuid(),generation=generation+1,lease_owner=NULL,lease_until=NULL');while(await runWorkerOnce(pool)){/* Complete all dirty work before accepting queries. */}if(redis){let cursor='0';do{const batch=await redis.scan(cursor,'MATCH','analytics:*','COUNT',100);cursor=batch[0];if(batch[1].length)await redis.del(...batch[1]);}while(cursor!=='0');}console.log(JSON.stringify({restored:true,deletionRecords:result.records,reaggregated:true}));}finally{await pool.end();await redis?.quit();}
