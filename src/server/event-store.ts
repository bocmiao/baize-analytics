import type {Pool, PoolClient} from 'pg';
import type {StoredEvent} from './clickhouse-store.js';
import {ClickHouseStore} from './clickhouse-store.js';
export interface EventReadOptions {from?: Date | string; to?: Date | string; type?: string; includeBots?: boolean; client?: PoolClient}
export interface EventReadResult {events: StoredEvent[]; source: 'postgres' | 'clickhouse'; mode: string; fallbackReason?: string; generation?: string; epoch?: string; watermark?: Date | string | null; coverage: number}
const stores = new WeakMap<Pool, EventStore>();
export function installEventStore(pool: Pool, store: EventStore): void {stores.set(pool, store);}
export async function readSiteEvents(pool: Pool, siteId: string, options: EventReadOptions = {}): Promise<EventReadResult> {return (stores.get(pool) || new EventStore(pool)).readSiteEvents(siteId, options);}
export class EventStore {
 constructor(private readonly pool: Pool, private readonly clickhouse?: ClickHouseStore) {}
 private async postgres(siteId: string, options: EventReadOptions, metadata: Partial<EventReadResult> = {}): Promise<EventReadResult> {
  const params: unknown[] = [siteId]; const clauses = ['e.site_id=$1'];
  if (options.from) {params.push(options.from); clauses.push(`e.ts>=$${params.length}`);}
  if (options.to) {params.push(options.to); clauses.push(`e.ts<$${params.length}`);}
  if (options.type) {params.push(options.type); clauses.push(`e.type=$${params.length}`);}
  if (!options.includeBots) clauses.push('NOT e.is_bot');
  clauses.push('NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=e.site_id AND t.visitor_id=e.visitor_id)', 'NOT EXISTS(SELECT 1 FROM identity_tombstones t WHERE t.site_id=e.site_id AND t.visitor_id=e.visitor_id AND t.started_at<=e.ts AND t.ended_at>e.ts)');
  const events = (await (options.client || this.pool).query(`SELECT e.* FROM events e WHERE ${clauses.join(' AND ')} ORDER BY e.ts,e.event_id`, params)).rows as StoredEvent[];
  return {events, mode: 'postgres', coverage: 1, ...metadata, source: 'postgres'};
 }
 async readSiteEvents(siteId: string, options: EventReadOptions = {}): Promise<EventReadResult> {
  if (options.client) return this.postgres(siteId, options, {fallbackReason: 'transaction_snapshot_requires_postgres'});
  if (!this.clickhouse) return this.postgres(siteId, options, {fallbackReason: 'clickhouse_not_configured'});
  const state = (await this.pool.query('SELECT e.*,a.generation::text AS current_generation,a.epoch::text AS current_epoch FROM aggregation_state a LEFT JOIN event_store_state e USING(site_id) WHERE a.site_id=$1', [siteId])).rows[0];
  const meta = {mode: state?.mode || 'postgres', generation: state?.current_generation, epoch: state?.current_epoch, watermark: state?.watermark};
  const fallback = (reason: string) => this.postgres(siteId, options, {...meta, fallbackReason: reason});
  if (!state || state.mode !== 'prefer_clickhouse') return fallback(state?.mode === 'mirror' ? 'mirror_only' : 'postgres_selected');
  if (!state.snapshot_id || state.snapshot_epoch !== state.current_epoch) return fallback('mirror_epoch_mismatch');
  if (String(state.snapshot_generation) !== String(state.current_generation)) return fallback('mirror_behind');
  const identity = {siteId, snapshotId: state.snapshot_id, epoch: state.snapshot_epoch, generation: String(state.snapshot_generation)};
  try {
   // Missing/externally truncated replicas must never silently answer zero events.
   if (await this.clickhouse.countSnapshot(identity) !== Number(state.snapshot_count)) return fallback('mirror_integrity_mismatch');
   const events = await this.clickhouse.readSnapshot(identity, options);
   const current = (await this.pool.query('SELECT a.generation::text AS generation,a.epoch::text AS epoch,e.mode,e.snapshot_id FROM aggregation_state a JOIN event_store_state e USING(site_id) WHERE a.site_id=$1', [siteId])).rows[0];
   if (!current || current.epoch !== identity.epoch || current.generation !== identity.generation || current.mode !== 'prefer_clickhouse' || current.snapshot_id !== identity.snapshotId) return fallback('source_changed_during_read');
   const tombstones = (await this.pool.query('SELECT visitor_id FROM tombstones WHERE site_id=$1', [siteId])).rows;
   const segments = (await this.pool.query('SELECT visitor_id,started_at,ended_at FROM identity_tombstones WHERE site_id=$1', [siteId])).rows;
   const deleted = new Set(tombstones.map(row => row.visitor_id));
   const safe = events.filter(event => event.site_id === siteId && !deleted.has(event.visitor_id) && !segments.some(segment => segment.visitor_id === event.visitor_id && +new Date(event.ts) >= +new Date(segment.started_at) && +new Date(event.ts) < +new Date(segment.ended_at)));
   return {events: safe, source: 'clickhouse', ...meta, coverage: 1};
  } catch {return fallback('clickhouse_unavailable');}
 }
}
