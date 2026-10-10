import {randomUUID} from 'node:crypto';
import type {Pool, PoolClient} from 'pg';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ClickHouseStore, type StoredEvent} from './clickhouse-store.js';
import {invalidateSiteCache} from './deletion.js';
import {runReplicaCleanup} from './clickhouse-cleanup.js';
import {lockSite,beginPartitionSnapshot, transaction} from './db.js';
import type {AppContext} from './context.js';
async function replicaTransaction<T>(client:PoolClient,run:(client:PoolClient)=>Promise<T>):Promise<T>{await client.query('BEGIN');try{const value=await run(client);await client.query('COMMIT');return value;}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}}
export type ReplicaMode = 'postgres' | 'mirror' | 'prefer_clickhouse';
export interface MirrorHooks {afterSnapshot?: () => Promise<void>; beforePublish?: () => Promise<void>}
const replicaLock = (siteId: string) => `clickhouse:${siteId}`;
export async function setReplicaMode(pool: Pool, siteId: string, mode: ReplicaMode) {
 await transaction(pool, async client => {await lockSite(client, siteId); await client.query("INSERT INTO event_store_state(site_id,mode) VALUES($1,$2) ON CONFLICT(site_id) DO UPDATE SET mode=excluded.mode,attempts=0,last_error=NULL,dead_letter_at=NULL,next_attempt_at=now(),updated_at=now()", [siteId, mode]);});
}
export class ClickHouseMirror {
 constructor(private readonly pool: Pool, private readonly store: ClickHouseStore, private readonly options: {minIntervalMs?: number; maxSnapshotBytes?: number; maxUploadMs?:number} = {}) {}
 async runCleanupOnce(): Promise<boolean> {return runReplicaCleanup(this.pool, this.store);}
 async withDeletionBarrier(client: PoolClient, siteId: string, scope: {visitorId?: string; from?: string; to?: string; all?: boolean}): Promise<void> {
  // Caller holds the regular site lock. Uploads release this lock before publication, avoiding lock inversion.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [replicaLock(siteId)]);
  await this.store.initialize(); await this.store.deleteScope(siteId, scope);
  await client.query('UPDATE event_store_state SET snapshot_id=NULL,snapshot_epoch=NULL,snapshot_generation=-1,snapshot_count=0,lease_owner=NULL,lease_until=NULL,attempts=0,last_error=NULL,dead_letter_at=NULL,next_attempt_at=now(),updated_at=now() WHERE site_id=$1', [siteId]);
  await client.query("UPDATE event_store_uploads SET status='obsolete',completed_at=now() WHERE site_id=$1 AND status='uploading'", [siteId]);
 }
 async runOnce(hooks: MirrorHooks = {}): Promise<boolean> {
  await this.runCleanupOnce();
  const owner = randomUUID();
  const row = (await this.pool.query("UPDATE event_store_state SET lease_owner=$1,lease_until=now()+interval '60 seconds' WHERE site_id=(SELECT e.site_id FROM event_store_state e JOIN aggregation_state a USING(site_id) WHERE e.mode!='postgres' AND e.attempts<3 AND e.next_attempt_at<=now() AND (e.snapshot_epoch IS DISTINCT FROM a.epoch OR e.published_at IS NULL OR e.published_at<now()-($2::int*interval '1 millisecond')) AND (e.snapshot_generation<a.generation OR e.snapshot_epoch IS DISTINCT FROM a.epoch) AND (e.lease_until IS NULL OR e.lease_until<now()) ORDER BY e.site_id FOR UPDATE OF e SKIP LOCKED LIMIT 1) RETURNING site_id", [owner, this.options.minIntervalMs ?? 60000])).rows[0];
  if (!row) return false; const siteId: string = row.site_id; const snapshotId = randomUUID();
  const connection = await this.pool.connect(); let replicaHeld = false; let captured: {generation: string; epoch: string} | undefined; let count = 0; let maxOutbox = '0'; let watermark: Date | string | null = null;
  let renewWork:Promise<unknown>|undefined;const renew=setInterval(()=>{if(renewWork)return;renewWork=connection.query("UPDATE event_store_state SET lease_until=now()+interval '60 seconds' WHERE site_id=$1 AND lease_owner=$2 AND lease_until>now()", [siteId,owner]).catch(()=>{}).finally(()=>{renewWork=undefined;});},15000);renew.unref();
  try {
   await beginPartitionSnapshot(connection);
   await connection.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [replicaLock(siteId)]); replicaHeld = true;
   captured = (await connection.query('SELECT generation::text,epoch::text FROM aggregation_state WHERE site_id=$1', [siteId])).rows[0];
   const site = (await connection.query('SELECT retention_days FROM sites WHERE id=$1', [siteId])).rows[0];
   if (!captured || !site) {await connection.query('ROLLBACK'); return false;}
   await connection.query('DECLARE replica_events NO SCROLL CURSOR FOR SELECT e.* FROM events e WHERE e.site_id=$1 AND e.ts>=now()-($2::int*interval \'1 day\') AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=e.site_id AND t.visitor_id=e.visitor_id) AND NOT EXISTS(SELECT 1 FROM identity_tombstones t WHERE t.site_id=e.site_id AND t.visitor_id=e.visitor_id AND t.started_at<=e.ts AND t.ended_at>e.ts) ORDER BY e.ts,e.event_id', [siteId, site.retention_days]);
   const events: StoredEvent[] = []; let bytes = 0;
   while (true) {const batch = (await connection.query('FETCH FORWARD 1000 FROM replica_events')).rows as StoredEvent[]; if (!batch.length) break; bytes += Buffer.byteLength(JSON.stringify(batch)); if (bytes > Math.max(1024, Math.min(this.options.maxSnapshotBytes ?? 128 * 1024 * 1024, 128 * 1024 * 1024))) throw Error('CLICKHOUSE_SNAPSHOT_LIMIT'); events.push(...batch);}
   await connection.query('CLOSE replica_events');
   maxOutbox = (await connection.query('SELECT COALESCE(max(id),0)::text AS id FROM outbox WHERE site_id=$1', [siteId])).rows[0].id;
   count = events.length; watermark = events.at(-1)?.ts || null;
   await connection.query('COMMIT');
   await connection.query("INSERT INTO event_store_uploads(snapshot_id,site_id,epoch,generation,status) VALUES($1,$2,$3,$4,'uploading')", [snapshotId, siteId, captured.epoch, captured.generation]);
   await hooks.afterSnapshot?.();
   await this.store.initialize();
   const identity = {siteId, snapshotId, epoch: captured.epoch, generation: captured.generation};
   const uploadDeadline=Date.now()+Math.max(1000,Math.min(this.options.maxUploadMs??120000,300000));
   const checkUpload=async()=>{if(Date.now()>uploadDeadline)throw Error('CLICKHOUSE_UPLOAD_DEADLINE');const live=await connection.query("SELECT 1 FROM event_store_state WHERE site_id=$1 AND lease_owner=$2 AND lease_until>now() AND mode!='postgres'",[siteId,owner]);if(!live.rowCount)throw Error('CLICKHOUSE_UPLOAD_LEASE_LOST');};
   await checkUpload();await this.store.writeSnapshot(identity, events,checkUpload);await checkUpload();
   if (await this.store.countSnapshot(identity) !== count) throw Error('CLICKHOUSE_SNAPSHOT_COUNT_MISMATCH');
   // Delete barrier may now take this session lock before the mirror requests the normal site lock.
   await connection.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [replicaLock(siteId)]); replicaHeld = false;
   await hooks.beforePublish?.();
   const published=await replicaTransaction(connection,async client=>{
    await lockSite(client, siteId);
    const fence = await client.query("SELECT 1 FROM aggregation_state a JOIN event_store_state e USING(site_id) WHERE a.site_id=$1 AND a.epoch=$2 AND a.generation>=$3::bigint AND e.lease_owner=$4 AND e.lease_until>now() AND e.mode!='postgres' FOR UPDATE OF e", [siteId, captured!.epoch, captured!.generation, owner]);
    if (!fence.rowCount) {await client.query("UPDATE event_store_uploads SET status='obsolete',completed_at=now() WHERE snapshot_id=$1", [snapshotId]); await client.query('UPDATE event_store_state SET lease_owner=NULL,lease_until=NULL WHERE site_id=$1 AND lease_owner=$2', [siteId, owner]); return false;}
    await client.query('UPDATE event_store_state SET snapshot_id=$2,snapshot_epoch=$3,snapshot_generation=$4,snapshot_count=$5,captured_outbox_id=$6,watermark=$7,published_at=now(),lease_owner=NULL,lease_until=NULL,attempts=0,last_error=NULL,dead_letter_at=NULL,next_attempt_at=now(),updated_at=now() WHERE site_id=$1', [siteId, snapshotId, captured!.epoch, captured!.generation, count, maxOutbox, watermark]);
    await client.query("UPDATE event_store_uploads SET status='published',completed_at=now() WHERE snapshot_id=$1", [snapshotId]); return true;
   });
   if (!published) await this.store.deleteSnapshot(siteId, snapshotId);
   return published;
  } catch {
   await connection.query('ROLLBACK').catch(() => {});
   await connection.query("UPDATE event_store_uploads SET status='failed',completed_at=now() WHERE snapshot_id=$1 AND status='uploading'", [snapshotId]).catch(() => {});
   await connection.query("UPDATE event_store_state SET attempts=attempts+1,next_attempt_at=now()+least(300,power(2,attempts)*5)*interval '1 second',last_error='CLICKHOUSE_MIRROR_FAILURE',dead_letter_at=CASE WHEN attempts>=2 THEN now() ELSE NULL END,lease_owner=NULL,lease_until=NULL WHERE site_id=$1 AND lease_owner=$2", [siteId, owner]);
   return false;
  } finally {
   clearInterval(renew);await renewWork?.catch(()=>{}); if (replicaHeld) await connection.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [replicaLock(siteId)]).catch(() => {}); connection.release();
  }
 }
}
export async function registerClickHouseRoutes(app: FastifyInstance, ctx: AppContext, mirror?: ClickHouseMirror) {
 const invalidate=async(siteId:string)=>{try{await invalidateSiteCache(ctx,siteId);return true;}catch{return false;}};
 app.get('/api/v1/sites/:siteId/storage', async req => {const {siteId} = req.params as {siteId: string}; await ctx.authorize(req, siteId, 'admin'); return {configured: Boolean(mirror), authority: 'postgres', supportedReads: ['analytics retained boundaries and filters', 'content', 'geography'], remainingPostgresReads: ['rollups', 'aggregation worker RR snapshot', 'governance', 'identity', 'realtime', 'event properties'], state: (await ctx.pool.query('SELECT mode,snapshot_id,snapshot_epoch,snapshot_generation,snapshot_count,watermark,attempts,last_error,dead_letter_at,published_at FROM event_store_state WHERE site_id=$1', [siteId])).rows[0] || {mode: 'postgres'}};});
 app.put('/api/v1/sites/:siteId/storage', async req => {const {siteId} = req.params as {siteId: string}; const user = await ctx.authorize(req, siteId, 'admin'); const {mode} = z.object({mode: z.enum(['postgres', 'mirror', 'prefer_clickhouse'])}).parse(req.body); if (!mirror && mode !== 'postgres') throw Object.assign(new Error('未配置ClickHouse基础设施'), {statusCode: 409}); await setReplicaMode(ctx.pool, siteId, mode); await ctx.audit(user.id, siteId, 'storage.mode', {mode}); const cacheInvalidated=await invalidate(siteId);return {mode, authority: 'postgres',cacheInvalidated};});
 app.post('/api/v1/sites/:siteId/storage/replay', async req => {const {siteId} = req.params as {siteId: string}; const user = await ctx.authorize(req, siteId, 'admin'); if (!mirror) throw Object.assign(new Error('未配置ClickHouse基础设施'), {statusCode: 409}); await transaction(ctx.pool, async client => {await lockSite(client, siteId); await client.query('UPDATE event_store_state SET attempts=0,last_error=NULL,dead_letter_at=NULL,snapshot_generation=-1,lease_owner=NULL,lease_until=NULL,next_attempt_at=now() WHERE site_id=$1', [siteId]);}); await ctx.audit(user.id, siteId, 'storage.replay', {});const cacheInvalidated=await invalidate(siteId);return {queued: true,cacheInvalidated};});
}
