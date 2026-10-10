import type {AnalyticsEvent} from './analytics.js';
export interface ClickHouseStoreConfig {url: string; username: string; password: string; fetch?: typeof fetch; timeoutMs?: number}
function boundDate(value: Date | string): string {return new Date(value).toISOString().replace('T', ' ').replace('Z', '');}
export interface StoredEvent extends AnalyticsEvent {is_bot?: boolean}
export interface SnapshotIdentity {siteId: string; snapshotId: string; epoch: string; generation: string}
/** Only sanitized persisted events enter this store; credentials never enter URLs or errors. */
export class ClickHouseStore {
 private readonly endpoint: URL;
 constructor(private readonly config: ClickHouseStoreConfig) {
  this.endpoint = new URL(config.url);
  if (!['http:', 'https:'].includes(this.endpoint.protocol) || this.endpoint.username || this.endpoint.password || this.endpoint.hash) throw Error('Invalid ClickHouse infrastructure URL');
 }
 private async request(query: string, params: Record<string, string> = {}, body?: string) {
  const endpoint = new URL(this.endpoint);
  endpoint.searchParams.set('query', query); endpoint.searchParams.set('date_time_input_format', 'best_effort');
  for (const [name, value] of Object.entries(params)) endpoint.searchParams.set(`param_${name}`, value);
  const response = await (this.config.fetch || fetch)(endpoint, {method: 'POST', headers: {'X-ClickHouse-User': this.config.username, 'X-ClickHouse-Key': this.config.password, 'Content-Type': 'application/x-ndjson'}, body, signal: AbortSignal.timeout(Math.max(1000, Math.min(this.config.timeoutMs || 15000, 30000)))});
  if (!response.ok) {await response.body?.cancel(); throw Error('CLICKHOUSE_HTTP_FAILURE');}
  return response;
 }
 private async command(query:string,params:Record<string,string>={},body?:string){const response=await this.request(query,params,body);await response.body?.cancel();}
 async initialize() {
  await this.command(`CREATE TABLE IF NOT EXISTS baize_event_snapshots_v1 (site_id String,snapshot_id UUID,epoch UUID,generation UInt64,event_id UUID,ts DateTime64(3,'UTC'),visitor_id String,page_id UUID,type LowCardinality(String),path String,payload String,dimensions String,is_bot Bool,created_at DateTime64(3,'UTC') DEFAULT now64(3)) ENGINE=ReplacingMergeTree(generation) PARTITION BY toYYYYMM(ts) ORDER BY (site_id,snapshot_id,event_id,ts)`);
 }
 async writeSnapshot(identity: SnapshotIdentity, events: StoredEvent[], beforeChunk?:()=>Promise<void>) {
  if (events.some(event => event.site_id !== identity.siteId)) throw Error('CLICKHOUSE_SITE_MISMATCH');
  // Chunking does not publish the pointer: only the PG fenced commit exposes a complete snapshot.
  for (let offset = 0; offset < events.length; offset += 1000) {
   await beforeChunk?.();
   const body = events.slice(offset, offset + 1000).map(event => JSON.stringify({site_id: identity.siteId, snapshot_id: identity.snapshotId, epoch: identity.epoch, generation: identity.generation, event_id: event.event_id, ts: new Date(event.ts).toISOString(), visitor_id: event.visitor_id, page_id: event.page_id, type: event.type, path: event.path, payload: JSON.stringify(event.payload), dimensions: JSON.stringify(event.dimensions), is_bot: Boolean(event.is_bot)})).join('\n');
   await this.command('INSERT INTO baize_event_snapshots_v1 FORMAT JSONEachRow', {}, body);
  }
 }
 async readSnapshot(identity: SnapshotIdentity, options: {from?: Date | string; to?: Date | string; type?: string; includeBots?: boolean} = {}): Promise<StoredEvent[]> {
  const clauses = ['site_id={site:String}', 'snapshot_id={snapshot:UUID}', 'epoch={epoch:UUID}', 'generation={generation:UInt64}'];
  const params: Record<string, string> = {site: identity.siteId, snapshot: identity.snapshotId, epoch: identity.epoch, generation: identity.generation};
  if (options.from) {clauses.push("ts>={from:DateTime64(3,'UTC')}"); params.from = boundDate(options.from);}
  if (options.to) {clauses.push("ts<{to:DateTime64(3,'UTC')}"); params.to = boundDate(options.to);}
  if (options.type) {clauses.push('type={type:String}'); params.type = options.type;}
  if (!options.includeBots) clauses.push('NOT is_bot');
  const response = await this.request(`SELECT site_id,toString(event_id) AS event_id,formatDateTime(ts,'%Y-%m-%dT%H:%i:%S.%fZ','UTC') AS event_ts,visitor_id,toString(page_id) AS page_id,type,path,payload,dimensions,is_bot FROM baize_event_snapshots_v1 FINAL WHERE ${clauses.join(' AND ')} ORDER BY ts,event_id FORMAT JSONEachRow`, params);
  let bytes = 0; const chunks: Uint8Array[] = []; const reader = response.body?.getReader();
  if (!reader) throw Error('CLICKHOUSE_EMPTY_RESPONSE');
  try {while (true) {const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > 128 * 1024 * 1024) throw Error('CLICKHOUSE_RESULT_LIMIT'); chunks.push(chunk.value);}} finally {await reader.cancel();}
  const text = Buffer.concat(chunks).toString('utf8');
  return text.trim() ? text.trim().split('\n').map(line => {const {event_ts, ...row} = JSON.parse(line); return {...row, ts: event_ts, payload: JSON.parse(row.payload), dimensions: JSON.parse(row.dimensions)} as StoredEvent;}) : [];
 }
 async countSnapshot(identity: SnapshotIdentity): Promise<number> {
  const response = await this.request('SELECT count() AS count FROM baize_event_snapshots_v1 FINAL WHERE site_id={site:String} AND snapshot_id={snapshot:UUID} AND epoch={epoch:UUID} AND generation={generation:UInt64} FORMAT JSON', {site: identity.siteId, snapshot: identity.snapshotId, epoch: identity.epoch, generation: identity.generation});
  const result = await response.json() as {data: {count: string | number}[]}; return Number(result.data[0]?.count || 0);
 }
 async countExpired(siteId: string, to: string): Promise<number> {
  const response = await this.request("SELECT count() AS count FROM baize_event_snapshots_v1 FINAL WHERE site_id={site:String} AND ts<{to:DateTime64(3,'UTC')} FORMAT JSON", {site: siteId, to: boundDate(to)}); const result = await response.json() as {data: {count: string | number}[]}; return Number(result.data[0]?.count || 0);
 }
 async deleteSnapshot(siteId: string, snapshotId: string) {await this.command('ALTER TABLE baize_event_snapshots_v1 DELETE WHERE site_id={site:String} AND snapshot_id={snapshot:UUID} SETTINGS mutations_sync=2', {site: siteId, snapshot: snapshotId});}
 async deleteScope(siteId: string, scope: {visitorId?: string; from?: string; to?: string; all?: boolean}) {
  const clauses = ['site_id={site:String}']; const params: Record<string, string> = {site: siteId};
  if (!scope.all) {if (!scope.visitorId) throw Error('CLICKHOUSE_DELETE_SCOPE_REQUIRED'); clauses.push('visitor_id={visitor:String}'); params.visitor = scope.visitorId;}
  if (scope.from) {clauses.push("ts>={from:DateTime64(3,'UTC')}"); params.from = boundDate(scope.from);}
  if (scope.to) {clauses.push("ts<{to:DateTime64(3,'UTC')}"); params.to = boundDate(scope.to);}
  await this.command(`ALTER TABLE baize_event_snapshots_v1 DELETE WHERE ${clauses.join(' AND ')} SETTINGS mutations_sync=2`, params);
 }
}
