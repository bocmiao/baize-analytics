import {createHash,createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import type {PoolClient} from 'pg';
import {boundedBackupLines} from './backup-lines.js';
import {readVerifiedDeletionRecords} from './deletion.js';
import {canonicalEventChecksum,type CanonicalClickHouse} from './canonical-clickhouse.js';
import type {StoredEvent} from './clickhouse-store.js';
import {lockSite} from './db.js';
const brand:unique symbol=Symbol('verified-canonical-raw-backup');
export type VerifiedCanonicalRawBackup={readonly [brand]:true};
const issued=new WeakMap<object,{client:PoolClient;site:string;epoch:string;generation:string;deletion:string;table:string;journalDir:string;journalChecksum:string}>();
async function checksum(path:string){const hash=createHash('sha256');if(!(await lstat(path)).isFile())throw Error('CANONICAL_BACKUP_FILE_INVALID');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
async function journalChecksum(dir:string){return createHash('sha256').update(JSON.stringify(await readVerifiedDeletionRecords(dir))).digest('hex');}
/** Local operator only; caller holds a transaction. Files contain actual fsynced signed canonical bodies. */
export async function loadVerifiedCanonicalRawBackup(c:PoolClient,input:{siteId:string;packageDirectory:string;journalDir:string;key:Buffer;store:CanonicalClickHouse}):Promise<VerifiedCanonicalRawBackup>{
 await lockSite(c,input.siteId);const path=join(input.packageDirectory,'manifest.json'),stat=await lstat(path);if(!stat.isFile()||stat.size>65536)throw Error('CANONICAL_BACKUP_MANIFEST_INVALID');
 const manifest=JSON.parse(await readFile(path,'utf8')) as {version:number;siteId:string;epoch:string;sourceScope:string;events:number;journalRecords:number;journalPrefixChecksum:string;files:Record<string,string>;mac:string};const {mac,...body}=manifest;
 if(manifest.version!==1||manifest.siteId!==input.siteId||manifest.sourceScope!==input.store.scopeIdentity()||typeof mac!=='string'||!/^[a-f0-9]{64}$/.test(mac)||!timingSafeEqual(Buffer.from(mac,'hex'),createHmac('sha256',input.key).update('baize-canonical-backup-v1\n'+JSON.stringify(body)).digest())||Object.keys(manifest.files).sort().join(',')!=='events.ndjson,published.ndjson')throw Error('CANONICAL_BACKUP_SIGNATURE_INVALID');
 for(const [name,hash]of Object.entries(manifest.files))if(await checksum(join(input.packageDirectory,name))!==hash)throw Error('CANONICAL_BACKUP_CHECKSUM_FAILURE');
 const journal=await readVerifiedDeletionRecords(input.journalDir),jh=createHash('sha256').update(JSON.stringify(journal)).digest('hex');if(journal.length!==manifest.journalRecords||jh!==manifest.journalPrefixChecksum)throw Error('CANONICAL_BACKUP_JOURNAL_STALE');
 const state=(await c.query('SELECT v.epoch::text,v.deletion_epoch::text,a.generation::text FROM canonical_event_authority v JOIN aggregation_state a USING(site_id) WHERE v.site_id=$1 AND v.authority=\'clickhouse\'',[input.siteId])).rows[0];if(!state||state.epoch!==manifest.epoch)throw Error('CANONICAL_BACKUP_EPOCH_STALE');
 const table='baize_raw_backup_'+randomUUID().replaceAll('-','');await c.query(`CREATE TEMP TABLE ${table}(event_id uuid PRIMARY KEY,body_hash text NOT NULL)ON COMMIT DROP`);let count=0;
 try{for await(const line of boundedBackupLines(join(input.packageDirectory,'events.ndjson'))){const item=JSON.parse(line) as {event:StoredEvent;bodyChecksum:string;sourceBatchId:string};if(item.event.site_id!==input.siteId||canonicalEventChecksum(item.event)!==item.bodyChecksum)throw Error('CANONICAL_BACKUP_BODY_INVALID');const receipt=(await c.query('SELECT body_hash FROM canonical_event_members WHERE site_id=$1 AND event_id=$2 AND batch_id=$3',[input.siteId,item.event.event_id,item.sourceBatchId])).rows[0];if(receipt?.body_hash!==item.bodyChecksum)throw Error('CANONICAL_BACKUP_RECEIPT_STALE');await c.query(`INSERT INTO ${table} VALUES($1,$2)`,[item.event.event_id,item.bodyChecksum]);count++;}if(count!==manifest.events)throw Error('CANONICAL_BACKUP_COUNT_INVALID');
 // Reject an old backup as soon as any current raw body lacks exact signed coverage.
 const raw=(await c.query(`SELECT 1 FROM events e LEFT JOIN ${table} b USING(event_id) LEFT JOIN canonical_event_members m ON m.site_id=e.site_id AND m.event_id=e.event_id WHERE e.site_id=$1 AND (b.event_id IS NULL OR b.body_hash IS DISTINCT FROM m.body_hash) LIMIT 1`,[input.siteId])).rowCount;if(raw)throw Error('CANONICAL_BACKUP_RAW_COVERAGE_MISSING');
 const proof=Object.freeze({[brand]:true}) as VerifiedCanonicalRawBackup;issued.set(proof,{client:c,site:input.siteId,epoch:state.epoch,generation:state.generation,deletion:state.deletion_epoch,table,journalDir:input.journalDir,journalChecksum:jh});return proof;
 }catch(error){await c.query(`DROP TABLE ${table}`);throw error;}
}
export async function assertVerifiedCanonicalRawBackup(c:PoolClient,site:string,epoch:string,rows:{event_id:string;body_hash:string}[],proof?:VerifiedCanonicalRawBackup){
 const value=proof&&issued.get(proof);if(!value||value.client!==c||value.site!==site||value.epoch!==epoch)throw Error('CANONICAL_BACKUP_REQUIRED');
 const state=(await c.query('SELECT v.epoch::text,v.deletion_epoch::text,a.generation::text FROM canonical_event_authority v JOIN aggregation_state a USING(site_id) WHERE v.site_id=$1',[site])).rows[0];if(state?.epoch!==value.epoch||state.deletion_epoch!==value.deletion||state.generation!==value.generation||await journalChecksum(value.journalDir)!==value.journalChecksum)throw Error('CANONICAL_BACKUP_READINESS_STALE');
 for(const row of rows)if(!(await c.query(`SELECT 1 FROM ${value.table} WHERE event_id=$1 AND body_hash=$2`,[row.event_id,row.body_hash])).rowCount)throw Error('CANONICAL_BACKUP_RAW_COVERAGE_MISSING');
}
