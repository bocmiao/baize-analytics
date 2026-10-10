import {beforeAll, afterAll, describe, it, expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Pool} from 'pg';
import {Redis} from 'ioredis';
import Fastify from 'fastify';
import {migrate, transaction, lockSite} from '../../src/server/db.js';
import {ClickHouseStore, type StoredEvent, type SnapshotIdentity} from '../../src/server/clickhouse-store.js';
import {ClickHouseMirror, setReplicaMode, registerClickHouseRoutes} from '../../src/server/clickhouse-mirror.js';
import {EventStore, installEventStore,streamSiteEventBatches} from '../../src/server/event-store.js';
import {registerAnalytics} from '../../src/server/analytics.js';
import {registerCollect} from '../../src/server/collect.js';
import {deleteVisitor, replayDeletionJournal} from '../../src/server/deletion.js';
import {runWorkerOnce} from '../../src/server/worker.js';
import type {AppContext} from '../../src/server/context.js';
const enabled = Boolean(process.env.TEST_DATABASE_URL && process.env.CLICKHOUSE_TEST_URL);
describe.skipIf(!enabled)('reliable full-schema PostgreSQL → real ClickHouse mirror and query switch', () => {
 const schema = `ch_${randomUUID().replaceAll('-', '')}`;
 const admin = new Pool({connectionString: process.env.TEST_DATABASE_URL});
 const pool = new Pool({connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}`});
 const config = {url: process.env.CLICKHOUSE_TEST_URL || 'http://127.0.0.1:38123', username: 'baize', password: 'local-test-only'};
 const ch = new ClickHouseStore(config); const mirror = new ClickHouseMirror(pool, ch, {minIntervalMs: 0}); const reader = new EventStore(pool, ch);
 const app = Fastify(); let dataDir: string; let ctx: AppContext;
 beforeAll(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`); await migrate(pool); dataDir = await mkdtemp(join(tmpdir(), 'baize-ch-'));
  ctx = {pool, redis: null, config: {dataDir, masterKey: Buffer.alloc(32, 1), publicUrl: 'http://localhost'}, clickhouseMirror: mirror, authorize: async () => ({id: randomUUID(), email: 'test@example.test', is_admin: true, name: 'test'}), audit: async () => {}} as unknown as AppContext;
  installEventStore(pool, reader); await ch.initialize(); await registerCollect(app, ctx); await registerAnalytics(app, ctx); await registerClickHouseRoutes(app, ctx, mirror);
 });
 afterAll(async () => {await app.close(); await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); await rm(dataDir, {recursive: true, force: true});});
 async function site<T>(fn: (id: string) => Promise<T>): Promise<T> {
  const id = randomUUID(); await pool.query("INSERT INTO sites(id,name,domain,salt_secret,timezone) VALUES($1,'CH test','example.test','test','UTC')", [id]); await pool.query('INSERT INTO aggregation_state(site_id) VALUES($1)', [id]);
  try {return await fn(id);} finally {installEventStore(pool, reader); await ch.deleteScope(id, {all: true}); await pool.query('DELETE FROM sites WHERE id=$1', [id]);}
 }
 const base = () => Date.now() - 7200000;
 function page(path: string, visitor = randomUUID(), ts = base()) {return {event_id: randomUUID(), type: 'pageview', ts, visitor_id: visitor, page_id: randomUUID(), url: `https://example.test${path}`, path};}
 async function post(id: string, events: object[]) {
  const response = await app.inject({method: 'POST', url: '/api/collect', headers: {origin: 'https://example.test', 'user-agent': 'Mozilla/5.0 Chrome/120.0'}, payload: {protocol_version: 1, sdk: 'real-ch-test', site_id: id, sent_at: Date.now(), events}}); expect(response.statusCode).toBe(202); return response.json();
 }
 async function identity(id: string): Promise<SnapshotIdentity> {const row = (await pool.query('SELECT snapshot_id,snapshot_epoch,snapshot_generation::text FROM event_store_state WHERE site_id=$1', [id])).rows[0]; return {siteId: id, snapshotId: row.snapshot_id, epoch: row.snapshot_epoch, generation: row.snapshot_generation};}
 it('mirrors the full sanitized collector schema, preserves retry idempotency, and switches actual content/geo/filtered stats reads', async () => site(async id => {
  const pv = page('/a'); const download = {...pv, event_id: randomUUID(), type: 'event', ts: pv.ts + 1000, event_name: 'download', props: {url: 'https://files.test/report.pdf', enabled: true, constructor: 'toString'}};
  const heartbeat = {...pv, event_id: randomUUID(), type: 'heartbeat', ts: pv.ts + 2000, interval_start: pv.ts, interval_end: pv.ts + 2000, visible_ms: 1800};
  const vital = {...pv, event_id: randomUUID(), type: 'vitals', ts: pv.ts + 3000, vitals: {lcp: 1210, inp: 100, cls: .03}};
  expect((await post(id, [pv, download, heartbeat, vital])).accepted).toBe(4); expect((await post(id, [pv])).duplicates).toBe(1);
  await setReplicaMode(pool, id, 'prefer_clickhouse'); expect(await mirror.runOnce()).toBe(true); expect(await mirror.runOnce()).toBe(false);
  const pointerCheck = await identity(id); await ch.readSnapshot(pointerCheck, {from: new Date(pv.ts - 1000)});
  const result = await reader.readSiteEvents(id, {from: new Date(pv.ts - 1000)}); expect({source: result.source, reason: result.fallbackReason}).toEqual({source: 'clickhouse', reason: undefined}); expect(result.events).toHaveLength(4); await ch.writeSnapshot(pointerCheck, result.events); expect(await ch.countSnapshot(pointerCheck)).toBe(4);
  const raw = (await pool.query('SELECT * FROM events WHERE site_id=$1 ORDER BY ts,event_id', [id])).rows as StoredEvent[];
  expect(result.events.map(e => ({id: e.event_id, ts: +new Date(e.ts), page: e.page_id, payload: e.payload, dimensions: e.dimensions}))).toEqual(raw.map(e => ({id: e.event_id, ts: +new Date(e.ts), page: e.page_id, payload: e.payload, dimensions: e.dimensions})));
  const range = `from=${new Date(pv.ts - 1000).toISOString()}&to=${new Date(pv.ts + 60000).toISOString()}`;
  const content = (await app.inject(`/api/v1/sites/${id}/content?${range}`)).json(); expect(content.storage.source).toBe('clickhouse'); expect(content.downloads[0]).toMatchObject({fileType: 'pdf', count: 1, uv: 1});
  const geography = (await app.inject(`/api/v1/sites/${id}/geography?${range}`)).json(); expect(geography.storage.source).toBe('clickhouse'); expect(geography.geographyCoverage).toBe(0);
  const stats = (await app.inject(`/api/v1/sites/${id}/stats?${range}&channel=direct`)).json(); expect(stats.storage.rawReads.every((r: {source: string}) => r.source === 'clickhouse')).toBe(true); expect(stats.totals.pv).toBe(1); expect(stats.totals.visibleSeconds).toBe(1.8); expect(stats.vitals.find((r: {metric: string}) => r.metric === 'lcp').p75).toBe(1210);
  const metadata = (await app.inject(`/api/v1/sites/${id}/storage`)).json(); expect(metadata.authority).toBe('postgres'); expect(metadata.remainingPostgresReads).toContain('aggregation worker RR snapshot');
 }));
 it('publishes captured high-watermarks during sustained collection and explicitly falls back until fresh', async () => site(async id => {
  const visitor = randomUUID(), ts = base(); await post(id, [page('/first', visitor, ts)]); await setReplicaMode(pool, id, 'prefer_clickhouse');
  let prior = -1;
  for (let step = 0; step < 4; step++) {
   expect(await mirror.runOnce({afterSnapshot: async () => {await post(id, [page(`/later-${step}`, visitor, ts + (step + 1) * 1000)]);}})).toBe(true);
   const state = (await pool.query('SELECT e.snapshot_generation::int,a.generation::int FROM event_store_state e JOIN aggregation_state a USING(site_id) WHERE site_id=$1', [id])).rows[0];
   expect(state.snapshot_generation).toBeGreaterThan(prior); expect(state.generation).toBeGreaterThan(state.snapshot_generation); prior = state.snapshot_generation;
   const result = await reader.readSiteEvents(id); expect(result.source).toBe('postgres'); expect(result.fallbackReason).toBe('mirror_behind'); expect(result.events).toHaveLength(step + 2);
  }
  expect(await mirror.runOnce()).toBe(true); expect((await reader.readSiteEvents(id)).source).toBe('clickhouse'); expect((await reader.readSiteEvents(id)).events).toHaveLength(5);
 }));
 it('uses bounded equivalent PG and CH filters with explicit truncation and typed-array bindings',async()=>site(async id=>{
  const visitor=randomUUID();await post(id,[page('/filtered',visitor),page('/other'),{...page('/filtered',visitor),type:'event',event_name:'flag',props:{enabled:true}}]);await setReplicaMode(pool,id,'prefer_clickhouse');expect(await mirror.runOnce()).toBe(true);const row=(await pool.query("SELECT event_id,visitor_id FROM events WHERE site_id=$1 AND type='event'",[id])).rows[0];const fromCH=await reader.readSiteEvents(id,{eventIds:[row.event_id],visitorIds:[row.visitor_id],eventName:'flag',path:'/filtered',limit:1});expect(fromCH.source).toBe('clickhouse');expect(fromCH.events).toHaveLength(1);expect(fromCH.events[0]!.payload.props).toEqual({enabled:true});expect(fromCH.truncated).toBe(false);const truncated=await reader.readSiteEvents(id,{limit:1});expect(truncated.truncated).toBe(true);expect(truncated.coverage).toBe(0);expect(truncated.events).toHaveLength(1);await setReplicaMode(pool,id,'postgres');const fromPG=await reader.readSiteEvents(id,{eventIds:[row.event_id],visitorIds:[row.visitor_id],eventName:'flag',path:'/filtered',limit:1});expect(fromPG.events.map(e=>e.event_id)).toEqual(fromCH.events.map(e=>e.event_id));expect((await reader.readSiteEvents(id,{eventIds:[],limit:1})).events).toEqual([]);
 }));
 it('switches real realtime, typed attributes and temporal identity view/path endpoints while streaming workers retain PG RR',async()=>site(async id=>{
  const visitor=randomUUID(),ts=Date.now()-20000,pv=page('/live',visitor,ts+1000);await post(id,[{...pv,event_id:randomUUID(),type:'identify',ts,user_id:'business-user'},pv,{...pv,event_id:randomUUID(),type:'event',ts:ts+2000,event_name:'flag',props:{enabled:true}},{...pv,event_id:randomUUID(),type:'event',ts:ts+3000,event_name:'flag',props:{enabled:'true'}},{...pv,event_id:randomUUID(),type:'heartbeat',ts:ts+4000,interval_start:ts+1000,interval_end:ts+4000,visible_ms:3000}]);await setReplicaMode(pool,id,'prefer_clickhouse');expect(await mirror.runOnce()).toBe(true);const range=`from=${new Date(ts-1000).toISOString()}&to=${new Date(ts+10000).toISOString()}`;const props=(await app.inject(`/api/v1/sites/${id}/event-properties?${range}&event_name=flag&property=enabled`)).json();expect(props.storage.source).toBe('clickhouse');expect(props.typedGroups).toEqual(expect.arrayContaining([{value:true,type:'boolean',count:1,visitors:1},{value:'true',type:'string',count:1,visitors:1}]));const realtime=(await app.inject(`/api/v1/sites/${id}/realtime`)).json();expect(realtime.storage.source).toBe('clickhouse');expect(realtime.online).toBe(1);expect(realtime.events).toHaveLength(5);const identities=(await app.inject(`/api/v1/sites/${id}/identities?${range}`)).json();expect(identities.storage.source).toBe('clickhouse');expect(identities.identities).toHaveLength(1);const paths=(await app.inject(`/api/v1/sites/${id}/users/business-user/paths?${range}`)).json();expect(paths.storage.source).toBe('clickhouse');expect(paths.sessions[0].paths[0].path).toBe('/live');await transaction(pool,async client=>{let count=0;for await(const batch of streamSiteEventBatches(pool,id,{client},2)){expect(batch.source).toBe('postgres');expect(batch.events.length).toBeLessThanOrEqual(2);count+=batch.events.length;}expect(count).toBe(5);expect((await client.query('SELECT count(*)::int n FROM pg_cursors')).rows[0].n).toBe(0);for await(const batch of streamSiteEventBatches(pool,id,{client},1)){expect(batch.events).toHaveLength(1);break;}expect((await client.query('SELECT count(*)::int n FROM pg_cursors')).rows[0].n).toBe(0);});
 }));
 it('takes exclusive claims, recovers expired leases, and rejects a pre-restore epoch pointer', async () => site(async id => {
  await post(id, [page('/lease')]); await setReplicaMode(pool, id, 'prefer_clickhouse'); const results = await Promise.all([mirror.runOnce(), mirror.runOnce()]); expect(results.filter(Boolean)).toHaveLength(1);
  await post(id, [page('/recovery')]); await pool.query("UPDATE event_store_state SET lease_owner=gen_random_uuid(),lease_until=now()-interval '1 second' WHERE site_id=$1", [id]); expect(await mirror.runOnce()).toBe(true);
  await post(id, [page('/old')]); expect(await mirror.runOnce({beforePublish: async () => {await pool.query('UPDATE aggregation_state SET epoch=gen_random_uuid() WHERE site_id=$1', [id]);}})).toBe(false);
  expect((await reader.readSiteEvents(id)).fallbackReason).toBe('mirror_epoch_mismatch');
  const obsolete = (await pool.query("SELECT snapshot_id,epoch,generation::text FROM event_store_uploads WHERE site_id=$1 AND status='obsolete'", [id])).rows[0]; expect(await ch.countSnapshot({siteId: id, snapshotId: obsolete.snapshot_id, epoch: obsolete.epoch, generation: obsolete.generation})).toBe(0);
 }));
 it('stops a lost lease before uploading any rows and preserves the prior published pointer',async()=>site(async id=>{
  await post(id,[page('/current')]);await setReplicaMode(pool,id,'prefer_clickhouse');expect(await mirror.runOnce()).toBe(true);const pointer=(await pool.query('SELECT snapshot_id FROM event_store_state WHERE site_id=$1',[id])).rows[0].snapshot_id;
  await post(id,[page('/new')]);expect(await mirror.runOnce({afterSnapshot:async()=>{await pool.query("UPDATE event_store_state SET lease_until=now()-interval '1 second' WHERE site_id=$1",[id]);}})).toBe(false);
  expect((await pool.query('SELECT snapshot_id FROM event_store_state WHERE site_id=$1',[id])).rows[0].snapshot_id).toBe(pointer);const failed=(await pool.query("SELECT snapshot_id,epoch,generation::text FROM event_store_uploads WHERE site_id=$1 AND status='failed'",[id])).rows[0];expect(await ch.countSnapshot({siteId:id,snapshotId:failed.snapshot_id,epoch:failed.epoch,generation:failed.generation})).toBe(0);expect((await reader.readSiteEvents(id)).fallbackReason).toBe('mirror_behind');
 }));
 it('blocks deletion behind an in-flight upload, then removes old snapshots before ACK and never republishes them', async () => site(async id => {
  const a = page('/A'), b = page('/B'); await post(id, [a, b]); await setReplicaMode(pool, id, 'prefer_clickhouse');
  const stored = (await pool.query("SELECT visitor_id FROM events WHERE site_id=$1 AND path='/A'", [id])).rows[0].visitor_id;
  let captured!: () => void, release!: () => void; const ready = new Promise<void>(resolve => {captured = resolve;}), hold = new Promise<void>(resolve => {release = resolve;});
  const upload = mirror.runOnce({afterSnapshot: async () => {captured(); await hold;}}); await ready;
  let acknowledged = false; const deletion = deleteVisitor(ctx, id, {visitor_id: stored}, null).then(value => {acknowledged = true; return value;});
  await new Promise(resolve => setTimeout(resolve, 50)); expect(acknowledged).toBe(false); release();
  expect((await deletion).deleted).toBe(true); expect(await upload).toBe(false);
  const deletedSnapshot = (await pool.query('SELECT snapshot_id,epoch,generation::text FROM event_store_uploads WHERE site_id=$1 ORDER BY created_at DESC LIMIT 1', [id])).rows[0];
  expect(await ch.countSnapshot({siteId: id, snapshotId: deletedSnapshot.snapshot_id, epoch: deletedSnapshot.epoch, generation: deletedSnapshot.generation})).toBe(0);
  expect((await reader.readSiteEvents(id)).events.map(e => e.path)).toEqual(['/B']); expect((await post(id, [{...a, event_id: randomUUID()}])).accepted).toBe(0);
  expect(await mirror.runOnce()).toBe(true); expect((await reader.readSiteEvents(id)).source).toBe('clickhouse'); expect((await reader.readSiteEvents(id)).events.map(e => e.path)).toEqual(['/B']);
 }));
 it('keeps a failed deletion journal durable, fails the ACK, and recovers through a real replica restore barrier', async () => site(async id => {
  await post(id, [page('/A'), page('/B')]); await setReplicaMode(pool, id, 'prefer_clickhouse'); expect(await mirror.runOnce()).toBe(true);
  const visitor = (await pool.query("SELECT visitor_id FROM events WHERE site_id=$1 AND path='/A'", [id])).rows[0].visitor_id;
  const failed = new ClickHouseMirror(pool, new ClickHouseStore({...config, fetch: async () => new Response('fault injection', {status: 503})}), {minIntervalMs: 0});
  await expect(deleteVisitor({...ctx, clickhouseMirror: failed}, id, {visitor_id: visitor}, null)).rejects.toThrow('CLICKHOUSE_HTTP_FAILURE');
  expect((await pool.query('SELECT count(*)::int n FROM events WHERE site_id=$1', [id])).rows[0].n).toBe(2); expect((await readFile(join(dataDir, 'tombstones.jsonl'), 'utf8')).includes(visitor)).toBe(true);
  await replayDeletionJournal(pool, dataDir, undefined, (client, siteId) => mirror.withDeletionBarrier(client, siteId, {all: true}));
  expect((await reader.readSiteEvents(id)).events.map(e => e.path)).toEqual(['/B']); expect((await reader.readSiteEvents(id)).source).toBe('postgres'); expect(await mirror.runOnce()).toBe(true); expect((await reader.readSiteEvents(id)).events.map(e => e.path)).toEqual(['/B']);
 }));
 it('falls back on transport failure, replica loss and a generation change during the actual CH read', async () => site(async id => {
  await post(id, [page('/safe')]); await setReplicaMode(pool, id, 'prefer_clickhouse'); expect(await mirror.runOnce()).toBe(true);
  const badReader = new EventStore(pool, new ClickHouseStore({...config, fetch: async () => new Response('fault injection', {status: 503})})); expect((await badReader.readSiteEvents(id)).fallbackReason).toBe('clickhouse_unavailable');
  class RacingStore extends ClickHouseStore {override async readSnapshot(value: SnapshotIdentity, options = {}) {const rows = await super.readSnapshot(value, options); await post(id, [page('/new')]); return rows;}}
  const raced = await new EventStore(pool, new RacingStore(config)).readSiteEvents(id); expect(raced.fallbackReason).toBe('source_changed_during_read'); expect(raced.events).toHaveLength(2);
  expect(await mirror.runOnce()).toBe(true); const pointer = await identity(id); await ch.deleteSnapshot(id, pointer.snapshotId); const lost = await reader.readSiteEvents(id); expect(lost.source).toBe('postgres'); expect(lost.fallbackReason).toBe('mirror_integrity_mismatch'); expect(lost.events).toHaveLength(2);
 }));
 it('persists bounded retry/DLQ without affecting collection, then administrator replay recovers actual CH writes', async () => site(async id => {
  await post(id, [page('/durable')]); await setReplicaMode(pool, id, 'prefer_clickhouse');
  const bad = new ClickHouseMirror(pool, new ClickHouseStore({...config, fetch: async () => new Response('fault injection', {status: 503})}), {minIntervalMs: 0});
  for (let attempt = 0; attempt < 3; attempt++) {await pool.query('UPDATE event_store_state SET next_attempt_at=now() WHERE site_id=$1', [id]); expect(await bad.runOnce()).toBe(false);}
  const state = (await pool.query('SELECT attempts,last_error,dead_letter_at FROM event_store_state WHERE site_id=$1', [id])).rows[0]; expect(state.attempts).toBe(3); expect(state.last_error).toBe('CLICKHOUSE_MIRROR_FAILURE'); expect(state.dead_letter_at).not.toBeNull();
  expect((await post(id, [page('/still-collecting')])).accepted).toBe(1); expect((await reader.readSiteEvents(id)).source).toBe('postgres'); expect(await mirror.runOnce()).toBe(false);
  expect((await app.inject({method: 'POST', url: `/api/v1/sites/${id}/storage/replay`})).statusCode).toBe(200); expect(await mirror.runOnce()).toBe(true); expect((await reader.readSiteEvents(id)).events).toHaveLength(2);
 }));
 it('reliably removes old published and failed snapshots, retries cleanup, and never deletes the current pointer', async () => site(async id => {
  await post(id, [page('/first')]); await setReplicaMode(pool, id, 'prefer_clickhouse'); expect(await mirror.runOnce()).toBe(true); const old = await identity(id);
  await post(id, [page('/second')]); expect(await mirror.runOnce()).toBe(true); const current = await identity(id);
  await pool.query("UPDATE event_store_uploads SET created_at=now()-interval '11 minutes' WHERE snapshot_id=$1", [old.snapshotId]);
  const failed = new ClickHouseMirror(pool, new ClickHouseStore({...config, fetch: async () => new Response('fault injection', {status: 503})})); expect(await failed.runCleanupOnce()).toBe(false);
  expect((await pool.query('SELECT cleanup_attempts,cleanup_error FROM event_store_uploads WHERE snapshot_id=$1', [old.snapshotId])).rows[0]).toMatchObject({cleanup_attempts: 1, cleanup_error: 'CLICKHOUSE_CLEANUP_FAILURE'});
  await pool.query('UPDATE event_store_uploads SET cleanup_next_at=now() WHERE snapshot_id=$1', [old.snapshotId]); expect(await mirror.runCleanupOnce()).toBe(true); expect(await ch.countSnapshot(old)).toBe(0); expect(await ch.countSnapshot(current)).toBe(2);
  const failedId = {...current, snapshotId: randomUUID()}; const events = (await reader.readSiteEvents(id)).events; await ch.writeSnapshot(failedId, events); await pool.query("INSERT INTO event_store_uploads(snapshot_id,site_id,epoch,generation,status,created_at) VALUES($1,$2,$3,$4,'failed',now()-interval '11 minutes')", [failedId.snapshotId, id, failedId.epoch, failedId.generation]);
  expect(await mirror.runCleanupOnce()).toBe(true); expect(await ch.countSnapshot(failedId)).toBe(0); expect(await ch.countSnapshot(current)).toBe(2);
 }));
 it('enforces per-site retained event deletion in every snapshot even after switching back to PostgreSQL', async () => site(async id => {
  await post(id, [page('/old', randomUUID(), Date.now() - 2 * 86400000), page('/recent')]); await setReplicaMode(pool, id, 'prefer_clickhouse'); expect(await mirror.runOnce()).toBe(true); const pointer = await identity(id); expect(await ch.countSnapshot(pointer)).toBe(2);
  await setReplicaMode(pool, id, 'postgres'); await pool.query('UPDATE sites SET retention_days=1 WHERE id=$1', [id]); await pool.query("UPDATE event_store_maintenance SET last_retention_at=now()-interval '2 hours' WHERE site_id=$1", [id]);
  expect(await mirror.runCleanupOnce()).toBe(true); expect(await ch.countSnapshot(pointer)).toBe(1); expect(await ch.countExpired(id, new Date(Date.now() - 86400000).toISOString())).toBe(0); expect((await pool.query('SELECT snapshot_id FROM event_store_state WHERE site_id=$1', [id])).rows[0].snapshot_id).toBeNull();
  await setReplicaMode(pool, id, 'prefer_clickhouse'); expect(await mirror.runOnce()).toBe(true); expect((await reader.readSiteEvents(id)).events.map(e => e.path)).toEqual(['/recent']);
 }));
 it('fails safely when the bounded PG snapshot budget is exceeded, without publishing a partial replica', async () => site(async id => {
  await post(id, [page('/bounded')]); await setReplicaMode(pool, id, 'prefer_clickhouse'); await pool.query("UPDATE events SET payload=payload||jsonb_build_object('test_budget',repeat('x',2048)) WHERE site_id=$1", [id]);
  const bounded = new ClickHouseMirror(pool, ch, {minIntervalMs: 0, maxSnapshotBytes: 1024}); expect(await bounded.runOnce()).toBe(false);
  expect((await pool.query('SELECT snapshot_id,attempts FROM event_store_state WHERE site_id=$1', [id])).rows[0]).toMatchObject({snapshot_id: null, attempts: 1}); expect((await reader.readSiteEvents(id)).source).toBe('postgres'); expect((await reader.readSiteEvents(id)).events).toHaveLength(1);
 }));
 it.skipIf(!process.env.REDIS_URL)('invalidates real Redis metadata on mode/replay and separates newly published snapshot cache keys', async () => site(async id => {
  const redis = new Redis(process.env.REDIS_URL!, {maxRetriesPerRequest: 1}); redis.on('error', () => {}); ctx.redis = redis;
  try {
   expect(await redis.ping()).toBe('PONG'); const event = page('/cache'); await post(id, [event]); await setReplicaMode(pool, id, 'postgres');
   const url = `/api/v1/sites/${id}/stats?from=${new Date(event.ts - 1000).toISOString()}&to=${new Date(event.ts + 60000).toISOString()}`;
   expect((await app.inject(url)).json().storage.rawReads[0].source).toBe('postgres'); expect(await redis.keys(`analytics:${id}:*`)).toHaveLength(1);
   expect((await app.inject({method: 'PUT', url: `/api/v1/sites/${id}/storage`, payload: {mode: 'prefer_clickhouse'}})).statusCode).toBe(200); expect(await redis.keys(`analytics:${id}:*`)).toHaveLength(0);
   expect((await app.inject(url)).json().storage.rawReads[0].source).toBe('postgres'); expect(await mirror.runOnce()).toBe(true);
   expect((await app.inject(url)).json().storage.rawReads[0].source).toBe('clickhouse');
   expect((await app.inject({method: 'POST', url: `/api/v1/sites/${id}/storage/replay`})).statusCode).toBe(200); expect(await redis.keys(`analytics:${id}:*`)).toHaveLength(0); expect((await app.inject(url)).json().storage.rawReads[0].source).toBe('postgres');
  } finally {const keys = await redis.keys(`analytics:${id}:*`); if (keys.length) await redis.del(...keys); await redis.quit(); ctx.redis = null;}
 }));
 it('keeps a durable mode change and its audit successful when Redis invalidation fails',async()=>site(async id=>{
  const previousAudit=ctx.audit;let audited=false;ctx.audit=async()=>{audited=true;};ctx.redis={scan:async()=>{throw Error('redis unavailable');}} as unknown as Redis;
  try{const r=await app.inject({method:'PUT',url:`/api/v1/sites/${id}/storage`,payload:{mode:'mirror'}});expect(r.statusCode).toBe(200);expect(r.json()).toMatchObject({mode:'mirror',cacheInvalidated:false});expect(audited).toBe(true);expect((await pool.query('SELECT mode FROM event_store_state WHERE site_id=$1',[id])).rows[0].mode).toBe('mirror');}finally{ctx.redis=null;ctx.audit=previousAudit;}
 }));
 it('keeps PostgreSQL RR worker snapshots authoritative and preserves root metadata/deletion locks', async () => site(async id => {
  await post(id, [page('/worker')]); await setReplicaMode(pool, id, 'prefer_clickhouse'); expect(await mirror.runOnce()).toBe(true); expect(await runWorkerOnce(pool)).toBe(true);
  await transaction(pool, async client => {await lockSite(client, id); const result = await reader.readSiteEvents(id, {client}); expect(result.source).toBe('postgres'); expect(result.fallbackReason).toBe('transaction_snapshot_requires_postgres');});
 }));
});
