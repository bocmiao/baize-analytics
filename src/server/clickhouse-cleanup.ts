import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import type {ClickHouseStore} from './clickhouse-store.js';
/** Durable cleanup runs even after a site's read mode returns to PostgreSQL. */
export async function runReplicaCleanup(pool: Pool, store: ClickHouseStore): Promise<boolean> {
 const owner = randomUUID();
 const candidate = (await pool.query("UPDATE event_store_uploads u SET cleanup_owner=$1,cleanup_until=now()+interval '60 seconds' WHERE snapshot_id=(SELECT u.snapshot_id FROM event_store_uploads u JOIN event_store_state e USING(site_id) WHERE u.snapshot_id IS DISTINCT FROM e.snapshot_id AND u.created_at<now()-interval '10 minutes' AND u.cleanup_next_at<=now() AND (u.cleanup_until IS NULL OR u.cleanup_until<now()) AND (e.lease_until IS NULL OR e.lease_until<now()) AND (u.status IN ('published','obsolete','failed') OR u.status='uploading' AND u.created_at<now()-interval '1 hour') ORDER BY u.created_at FOR UPDATE OF u SKIP LOCKED LIMIT 1) RETURNING site_id,snapshot_id", [owner])).rows[0];
 if (candidate) {
  const client = await pool.connect();
  try {
   await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`clickhouse:${candidate.site_id}`]);
   const safe = await client.query('SELECT 1 FROM event_store_uploads u JOIN event_store_state e USING(site_id) WHERE u.snapshot_id=$1 AND u.cleanup_owner=$2 AND u.snapshot_id IS DISTINCT FROM e.snapshot_id AND (e.lease_until IS NULL OR e.lease_until<now()) FOR UPDATE OF u', [candidate.snapshot_id, owner]);
   if (!safe.rowCount) {await client.query('UPDATE event_store_uploads SET cleanup_owner=NULL,cleanup_until=NULL WHERE snapshot_id=$1 AND cleanup_owner=$2', [candidate.snapshot_id, owner]); await client.query('COMMIT'); return false;}
   await store.initialize(); await store.deleteSnapshot(candidate.site_id, candidate.snapshot_id);
   await client.query('DELETE FROM event_store_uploads WHERE snapshot_id=$1 AND cleanup_owner=$2', [candidate.snapshot_id, owner]); await client.query('COMMIT'); return true;
  } catch {
   await client.query('ROLLBACK').catch(() => {});
   await client.query("UPDATE event_store_uploads SET cleanup_attempts=cleanup_attempts+1,cleanup_error='CLICKHOUSE_CLEANUP_FAILURE',cleanup_next_at=now()+least(3600,power(2,least(cleanup_attempts,10))*5)*interval '1 second',cleanup_owner=NULL,cleanup_until=NULL WHERE snapshot_id=$1 AND cleanup_owner=$2", [candidate.snapshot_id, owner]); return false;
  } finally {client.release();}
 }
 await pool.query('INSERT INTO event_store_maintenance(site_id) SELECT site_id FROM event_store_state ON CONFLICT DO NOTHING');
 const maintenance = (await pool.query("UPDATE event_store_maintenance SET lease_owner=$1,lease_until=now()+interval '60 seconds' WHERE site_id=(SELECT m.site_id FROM event_store_maintenance m JOIN event_store_state e USING(site_id) WHERE (m.last_retention_at IS NULL OR m.last_retention_at<now()-interval '1 hour') AND m.next_attempt_at<=now() AND (m.lease_until IS NULL OR m.lease_until<now()) AND (e.lease_until IS NULL OR e.lease_until<now()) ORDER BY m.site_id FOR UPDATE OF m SKIP LOCKED LIMIT 1) RETURNING site_id", [owner])).rows[0];
 if (!maintenance) return false; const client = await pool.connect();
 try {
  await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`clickhouse:${maintenance.site_id}`]);
  const active = await client.query('SELECT 1 FROM event_store_state WHERE site_id=$1 AND lease_until>now()', [maintenance.site_id]);
  if (active.rowCount) {await client.query('UPDATE event_store_maintenance SET lease_owner=NULL,lease_until=NULL WHERE site_id=$1 AND lease_owner=$2', [maintenance.site_id, owner]); await client.query('COMMIT'); return false;}
  const site = (await client.query('SELECT retention_days FROM sites WHERE id=$1', [maintenance.site_id])).rows[0];
  if (!site) {await client.query('ROLLBACK'); return false;}
  const cutoff = new Date(Date.now() - Number(site.retention_days) * 86400000).toISOString();
  await store.initialize(); const deleted = await store.countExpired(maintenance.site_id, cutoff);
  if (deleted) {await store.deleteScope(maintenance.site_id, {all: true, to: cutoff}); await client.query('UPDATE event_store_state SET snapshot_id=NULL,snapshot_epoch=NULL,snapshot_generation=-1,snapshot_count=0,attempts=0,last_error=NULL,dead_letter_at=NULL,next_attempt_at=now(),updated_at=now() WHERE site_id=$1', [maintenance.site_id]);}
  await client.query('UPDATE event_store_maintenance SET last_retention_at=now(),lease_owner=NULL,lease_until=NULL,attempts=0,last_error=NULL,next_attempt_at=now() WHERE site_id=$1 AND lease_owner=$2', [maintenance.site_id, owner]); await client.query('COMMIT'); return true;
 } catch {
  await client.query('ROLLBACK').catch(() => {}); await client.query("UPDATE event_store_maintenance SET attempts=attempts+1,last_error='CLICKHOUSE_RETENTION_FAILURE',next_attempt_at=now()+least(3600,power(2,least(attempts,10))*5)*interval '1 second',lease_owner=NULL,lease_until=NULL WHERE site_id=$1 AND lease_owner=$2", [maintenance.site_id, owner]); return false;
 } finally {client.release();}
}
