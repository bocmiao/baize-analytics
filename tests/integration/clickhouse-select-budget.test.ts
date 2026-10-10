import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {configureClickHouseSelect} from '../../src/server/clickhouse-select-budget.js';
import {consumeClickHouseCommand} from '../../src/server/clickhouse-command-response.js';
import {ClickHouseStore} from '../../src/server/clickhouse-store.js';
import {RemainingFactTransport} from '../../src/server/remaining-fact-transport.js';
/** Real server semantics, no new service or credentials. Explicitly enabled by the runner. */
describe.skipIf(!process.env.CLICKHOUSE_TEST_URL)('real ClickHouse explicit SELECT execution limit',()=>{
 const base=process.env.CLICKHOUSE_TEST_URL||'http://127.0.0.1:38123';
 const headers={'X-ClickHouse-User':process.env.CLICKHOUSE_TEST_USER||'baize','X-ClickHouse-Key':process.env.CLICKHOUSE_TEST_PASSWORD||'local-test-only'};
 async function request(query:string,selectMilliseconds?:number,stream=false){const url=new URL(base);url.searchParams.set('query',query);if(selectMilliseconds!==undefined)configureClickHouseSelect(url,selectMilliseconds);if(stream){url.searchParams.set('wait_end_of_query','0');url.searchParams.set('buffer_size','1');}return fetch(url,{method:'POST',headers,signal:AbortSignal.timeout(10000)});}
 it('supports fractional execution deadline with throw, never a successful partial JSON result',async()=>{
  const version=await request('SELECT version() AS version FORMAT JSON',5000);expect(version.ok).toBe(true);expect((await version.json()).data[0].version).toMatch(/^25\.8\./);
  // A longer diagnostic client deadline observes the server error instead of racing the client abort.
  const response=await request('SELECT number,sleepEachRow(0.01) FROM numbers(1000) SETTINGS max_block_size=1 FORMAT JSON',50);
  const text=await response.text();expect(text).toMatch(/TIMEOUT_EXCEEDED|Timeout exceeded|Code: 159/);const completed=JSON.parse(text);expect(completed.exception).toMatch(/TIMEOUT_EXCEEDED|Timeout exceeded|Code: 159/);expect(completed.data.length).toBeLessThan(1000);await expect(consumeClickHouseCommand(new Response(text),'SAFE_SELECT_EXECUTION_FAILED')).rejects.toThrow('SAFE_SELECT_EXECUTION_FAILED');
 },15000);
 it('HTTP 200 streaming response followed by execution error is rejected at complete body, not acknowledged',async()=>{
  const response=await request('SELECT number,sleepEachRow(0.01) FROM numbers(1000) SETTINGS max_block_size=1 FORMAT JSONEachRow',50,true);
  expect(response.status).toBe(200);const completed=await response.clone().text();expect(completed).toMatch(/TIMEOUT_EXCEEDED|Timeout exceeded|Code: 159/);const records=completed.trim().split('\n').map(line=>JSON.parse(line));expect(records.some(record=>typeof record.exception==='string')).toBe(true);await expect(consumeClickHouseCommand(response,'SAFE_SELECT_EXECUTION_FAILED')).rejects.toThrow('SAFE_SELECT_EXECUTION_FAILED');
 },15000);
 it('real SELECT adapters reject HTTP200 JSON and JSONEachRow execution exceptions with a safe code',async()=>{
  const diagnosticFetch:typeof fetch=async(input,init)=>{const url=new URL(String(input));const original=url.searchParams.get('query')||'';expect(url.searchParams.get('timeout_overflow_mode')).toBe('throw');expect(url.searchParams.get('max_execution_time')).toBe('5');
   // Test-only server fault injection: keep the adapter's 5s client signal, narrow server
   // execution to 50ms so its exception arrives before a competing client abort.
   configureClickHouseSelect(url,50);if(original.includes('JSONEachRow'))url.searchParams.set('query',"SELECT 'site' site_id,toString(number) event_id,'2026-10-10T00:00:00Z' event_ts,'visitor' visitor_id,'page' page_id,'pageview' type,'/' path,'{}' payload,'{}' dimensions,false is_bot,sleepEachRow(0.01) FROM numbers(1000) SETTINGS max_block_size=1 FORMAT JSONEachRow");const response=await fetch(url,init);expect(response.status).toBe(200);return response;
  };
  const config={url:base,username:headers['X-ClickHouse-User'],password:headers['X-ClickHouse-Key'],timeoutMs:5000,fetch:diagnosticFetch};
  const json=new RemainingFactTransport(config);await expect(json.rows('SELECT number,sleepEachRow(0.01) FROM numbers(1000) SETTINGS max_block_size=1')).rejects.toMatchObject({code:'canonical_unavailable'});
  const lines=new ClickHouseStore(config);await expect(lines.readSnapshot({siteId:'site',snapshotId:randomUUID(),epoch:randomUUID(),generation:'1'})).rejects.toMatchObject({code:'canonical_unavailable'});
 },20000);
 it('explicit SELECT settings do not enter INSERT/ALTER DELETE; actual synchronous deletion and unknown-write response checks remain',async()=>{
  const table='baize_select_budget_'+randomUUID().replaceAll('-',''),seen:URL[]=[];
  const transport=new RemainingFactTransport({url:base,username:headers['X-ClickHouse-User'],password:headers['X-ClickHouse-Key'],timeoutMs:5000,fetch:async(input,init)=>{seen.push(new URL(String(input)));return fetch(input,init);}});
  async function command(q:string){const response=await transport.request(q);expect(response.ok).toBe(true);await consumeClickHouseCommand(response,'SAFE_WRITE_NOT_CONFIRMED');}
  try{await command(`CREATE TABLE ${table}(value UInt32) ENGINE=MergeTree ORDER BY value`);await command(`INSERT INTO ${table} VALUES(1)`);await command(`ALTER TABLE ${table} DELETE WHERE value=1 SETTINGS mutations_sync=2`);const rows=await transport.rows<{n:string}>(`SELECT count() n FROM ${table}`);expect(Number(rows[0]!.n)).toBe(0);for(const url of seen.slice(0,-1)){expect(url.searchParams.has('max_execution_time')).toBe(false);expect(url.searchParams.has('timeout_overflow_mode')).toBe(false);}expect(seen.at(-1)!.searchParams.get('max_execution_time')).toBe('5');
   const unknown=await request(`INSERT INTO ${table} VALUES('not-an-integer')`);if(unknown.ok)await expect(consumeClickHouseCommand(unknown,'SAFE_WRITE_NOT_CONFIRMED')).rejects.toThrow('SAFE_WRITE_NOT_CONFIRMED');else{await unknown.body?.cancel();expect(unknown.ok).toBe(false);}
  }finally{await command(`DROP TABLE IF EXISTS ${table} SYNC`);}
 },20000);
});
