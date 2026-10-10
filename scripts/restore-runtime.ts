import { createPool,migrate,transaction,lockSite } from '../src/server/db.js';
import { initializeJournal,replayDeletionJournal } from '../src/server/deletion.js';
import { runRestoreRebuild } from './restore-rebuild.js';
import { scheduleExportCleanup,runFileCleanup } from '../src/server/file-cleanup.js';
import { Redis } from 'ioredis';
import { resolve } from 'node:path';
import { access } from 'node:fs/promises';
import {ClickHouseStore} from '../src/server/clickhouse-store.js';
import {ClickHouseMirror} from '../src/server/clickhouse-mirror.js';
import {restoreReplicaConfig,invalidateRestoredReplica} from './restore-replica.js';
const url=new URL(process.env.DATABASE_URL??'postgresql://baize_dev@127.0.0.1:5432/baize_dev');if(process.env.RESTORE_DATABASE){if(!/^baize_restore_[a-zA-Z0-9_]+$/.test(process.env.RESTORE_DATABASE))throw new Error('Unsafe restore database');url.pathname='/'+process.env.RESTORE_DATABASE;}
const dir=resolve(process.env.DATA_DIR??'data');
// Validate the independently retained journal before any migration or query access.
await initializeJournal(dir,true);process.env.REQUIRE_DELETION_JOURNAL='1';
const extra=resolve(dir,'restore-backup-tombstones.jsonl');await access(extra);
const pool=createPool(url.toString());const redis=process.env.REDIS_URL?new Redis(process.env.REDIS_URL):null;
const replicaConfig=restoreReplicaConfig(process.env);const replica=replicaConfig?new ClickHouseMirror(pool,new ClickHouseStore(replicaConfig)):undefined;
try{
  await migrate(pool);const result=await replayDeletionJournal(pool,dir,extra,replica?(client,siteId)=>replica.withDeletionBarrier(client,siteId,{all:true}):undefined);
  await transaction(pool,async client=>{
    for(const row of(await client.query('SELECT id FROM sites ORDER BY id')).rows){await lockSite(client,row.id);await replica?.withDeletionBarrier(client,row.id,{all:true});await scheduleExportCleanup(client,row.id,dir);}
    await client.query("UPDATE export_jobs SET status='revoked',path=NULL,lease_until=NULL,error='Restore invalidated prior export' WHERE status<>'revoked'");
    await client.query("UPDATE notification_jobs SET status='cancelled',lease_until=NULL,last_error='Restore cancelled old delivery' WHERE status IN('pending','running')");
    await client.query("UPDATE external_jobs SET status='failed',finished_at=now(),lease_owner=NULL,lease_until=NULL,generation=generation+1,next_attempt_at='infinity' WHERE status IN('running','failed')");
    if(process.env.RESTORE_DATABASE)await invalidateRestoredReplica(client);
    await client.query('UPDATE report_schedules SET enabled=false');
    await client.query('UPDATE aggregation_state SET epoch=gen_random_uuid(),generation=generation+1,processed_generation=0,lease_owner=NULL,lease_until=NULL,attempts=0,dead_letter_at=NULL,last_error=NULL');
    await client.query("UPDATE export_file_cleanup SET next_at=now() WHERE status='pending'");
  });
  const cleanup=await runFileCleanup({pool,config:{dataDir:dir}});if(cleanup.pending)throw new Error('Restored files cleanup is pending; queries remain closed');
  const rebuild=await runRestoreRebuild(pool);
  if(redis)for(const row of(await pool.query('SELECT id FROM sites')).rows)for(const pattern of [`analytics:${row.id}:*`,`baize:online:${row.id}:*`]){let cursor='0';do{const batch=await redis.scan(cursor,'MATCH',pattern,'COUNT',100);cursor=batch[0];if(batch[1].length)await redis.del(...batch[1]);}while(cursor!=='0');}
  console.log(JSON.stringify({restored:true,deletionRecords:result.records,reaggregated:rebuild.verified,rebuild,fileCleanup:cleanup,schedulesPaused:true}));
}finally{await pool.end();await redis?.quit();}
