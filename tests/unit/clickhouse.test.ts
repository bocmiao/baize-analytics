import {it, expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {ClickHouseStore, type StoredEvent} from '../../src/server/clickhouse-store.js';
const identity = {siteId: "tenant' OR 1=1--", snapshotId: randomUUID(), epoch: randomUUID(), generation: '12'};
it('binds hostile identifiers and UTC date parameters without embedding credentials in URLs or SQL', async () => {
 const requests: URL[] = [];
 const store = new ClickHouseStore({url: 'https://clickhouse.internal/', username: 'service', password: 'test-secret', fetch: async input => {requests.push(new URL(String(input))); return new Response('');}});
 await store.readSnapshot(identity, {from: '2026-10-10T12:00:00.123+08:00', type: "event' OR 1=1"});
 const url = requests[0]!; expect(url.searchParams.get('param_site')).toBe(identity.siteId); expect(url.searchParams.get('param_from')).toBe('2026-10-10 04:00:00.123'); expect(url.searchParams.get('param_type')).toBe("event' OR 1=1"); expect(url.searchParams.get('query')).not.toContain(identity.siteId); expect(url.href).not.toContain('test-secret'); expect(url.username).toBe('');
});
it('rejects cross-site snapshot writes before transport and rejects credential URLs', async () => {
 let requests = 0;
 const store = new ClickHouseStore({url: 'https://clickhouse.internal/', username: 'service', password: 'test-secret', fetch: async () => {requests++; return new Response('');}});
 const row: StoredEvent = {site_id: 'different-site', event_id: randomUUID(), page_id: randomUUID(), visitor_id: 'v', ts: new Date(), type: 'pageview', path: '/', payload: {}, dimensions: {}};
 await expect(store.writeSnapshot(identity, [row])).rejects.toThrow('CLICKHOUSE_SITE_MISMATCH'); expect(requests).toBe(0);
 expect(() => new ClickHouseStore({url: 'https://service:password@internal/', username: '', password: ''})).toThrow('Invalid ClickHouse infrastructure URL');
});
it('hides downstream response details on failure and never treats a failure as an empty successful replica', async () => {
 const store = new ClickHouseStore({url: 'https://clickhouse.internal/', username: 'service', password: 'test-secret', fetch: async () => new Response('private downstream detail', {status: 503})});
 await expect(store.readSnapshot(identity)).rejects.toThrow('CLICKHOUSE_HTTP_FAILURE');
});
