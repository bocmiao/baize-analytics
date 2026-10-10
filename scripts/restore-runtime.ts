import {CanonicalClickHouse,installCanonicalStore} from '../src/server/canonical-clickhouse.js';
import {readFile} from 'node:fs/promises';
import {invalidateSiteAi} from '../src/server/ai-invalidation.js';
import {rebasePublishedFactEpoch} from '../src/server/fact-invalidation.js';
import {cleanupHistoryBackupFiles} from '../src/server/history-security.js';
import {HistoryStore,installHistoryStore,rebaseDeletedHistory,expireHistorySnapshots} from '../src/server/history-store.js';
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
const canonicalTable=Boolean((await pool.query("SELECT to_regclass('canonical_event_authority') IS NOT NULL present")).rows[0].present);const canonicalPresent=canonicalTable&&Boolean((await pool.query("SELECT 1 FROM canonical_event_authority WHERE authority='clickhouse' LIMIT 1")).rowCount);const canonicalMode=(canonicalPresent||process.env.CANONICAL_RESTORE_VERIFIED==='1')&&(process.env.CANONICAL_RESTORE_VERIFIED==='1'||process.env.CANONICAL_SAME_DB_ROLLBACK==='1');const replicaConfig=canonicalMode&&process.env.CLICKHOUSE_URL?{url:process.env.CLICKHOUSE_URL,username:process.env.CLICKHOUSE_USER||'default',password:process.env.CLICKHOUSE_PASSWORD||''}:restoreReplicaConfig(process.env);const replica=replicaConfig&&!canonicalMode?new ClickHouseMirror(pool,new ClickHouseStore(replicaConfig)):undefined;
const canonical=canonicalMode&&replicaConfig?new CanonicalClickHouse(replicaConfig):undefined;if(canonical)installCanonicalStore(pool,canonical);
const history=replicaConfig?new HistoryStore(replicaConfig):undefined;if(history)installHistoryStore(pool,history);
try{
  if(history)await history.initialize();await migrate(pool);
  if((await pool.query("SELECT 1 FROM canonical_event_authority WHERE authority='clickhouse' LIMIT 1")).rowCount){if(!canonical)throw Error('CANONICAL_AUTHORITY_REQUIRES_INDEPENDENT_RESTORE');if(process.env.RESTORE_DATABASE){const proof=JSON.parse(await readFile(resolve(dir,'canonical-restore-proof.json'),'utf8')) as {version:number;database:string;scope:string;sites:{siteId:string;epoch:string;verified:boolean}[]};if(proof.version!==1||proof.database!==url.pathname.slice(1)||proof.scope!==canonical.scopeIdentity())throw Error('CANONICAL_RESTORE_PROOF_INVALID');for(const site of proof.sites){const state=(await pool.query('SELECT authority,epoch::text FROM canonical_event_authority WHERE site_id=$1',[site.siteId])).rows[0];if(!site.verified||state?.authority!=='clickhouse'||state.epoch!==site.epoch)throw Error('CANONICAL_RESTORE_PROOF_INVALID');}}}
  if(process.env.RESTORE_DATABASE&&(await pool.query("SELECT 1 FROM history_manifests WHERE status='published' LIMIT 1")).rowCount){const proof=JSON.parse(await readFile(resolve(dir,'history-restore-proof.json'),'utf8')) as {version:number;database:string;scope:string;verified:boolean;manifests:number};if(!canonical||proof.version!==1||proof.database!==url.pathname.slice(1)||proof.scope!==canonical.scopeIdentity()||!proof.verified||proof.manifests!==Number((await pool.query("SELECT count(*) n FROM history_manifests WHERE status='published'")).rows[0].n))throw Error('HISTORY_RESTORE_SCOPED_PACKAGE_REQUIRED');}if(process.env.RESTORE_DATABASE){await pool.query("UPDATE history_backup_files SET status='revoked',next_cleanup_at=now() WHERE status='ready'");}const result=await replayDeletionJournal(pool,dir,extra,replica?(client,siteId)=>replica.withDeletionBarrier(client,siteId,{all:true}):undefined);
  if(history)await expireHistorySnapshots(pool,history);
  await transaction(pool,async client=>{
    for(const row of(await client.query('SELECT id FROM sites ORDER BY id')).rows){await lockSite(client,row.id);await replica?.withDeletionBarrier(client,row.id,{all:true});if(!history&&(await client.query("SELECT 1 FROM history_manifests WHERE site_id=$1 AND status='published' LIMIT 1",[row.id])).rowCount)throw Error('HISTORY_RESTORE_STORE_REQUIRED');await invalidateSiteAi(client,row.id);await scheduleExportCleanup(client,row.id,dir);}
    await client.query("UPDATE export_jobs SET status='revoked',path=NULL,lease_until=NULL,error='Restore invalidated prior export' WHERE status<>'revoked'");
    await client.query("UPDATE notification_jobs SET status='cancelled',lease_until=NULL,last_error='Restore cancelled old delivery' WHERE status IN('pending','running')");
    await client.query("UPDATE external_jobs SET status='failed',finished_at=now(),lease_owner=NULL,lease_until=NULL,generation=generation+1,next_attempt_at='infinity' WHERE status IN('running','failed')");
    if(process.env.RESTORE_DATABASE)await invalidateRestoredReplica(client);
    await client.query('UPDATE report_schedules SET enabled=false');
    await client.query('UPDATE aggregation_state SET epoch=gen_random_uuid(),generation=generation+1,processed_generation=0,lease_owner=NULL,lease_until=NULL,attempts=0,dead_letter_at=NULL,last_error=NULL');
    for(const row of(await client.query('SELECT id FROM sites ORDER BY id')).rows){await rebasePublishedFactEpoch(client,row.id);if(history)await rebaseDeletedHistory(client,pool,row.id,true,history);}
    await client.query("UPDATE export_file_cleanup SET next_at=now() WHERE status='pending'");
  });
  const historyCleanup=await cleanupHistoryBackupFiles(pool,dir);if(historyCleanup.pending)throw Error('Restored history backup cleanup pending');const cleanup=await runFileCleanup({pool,config:{dataDir:dir}});if(cleanup.pending)throw new Error('Restored files cleanup is pending; queries remain closed');
  const rebuild=await runRestoreRebuild(pool);
  if(redis)for(const row of(await pool.query('SELECT id FROM sites')).rows)for(const pattern of [`analytics:${row.id}:*`,`baize:online:${row.id}:*`]){let cursor='0';do{const batch=await redis.scan(cursor,'MATCH',pattern,'COUNT',100);cursor=batch[0];if(batch[1].length)await redis.del(...batch[1]);}while(cursor!=='0');}
  console.log(JSON.stringify({restored:true,deletionRecords:result.records,reaggregated:rebuild.verified,rebuild,fileCleanup:cleanup,schedulesPaused:true}));
}finally{await pool.end();await redis?.quit();}
