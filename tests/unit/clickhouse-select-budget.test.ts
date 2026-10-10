import {describe,it,expect} from 'vitest';
import {configureClickHouseSelect} from '../../src/server/clickhouse-select-budget.js';
import {CanonicalClickHouse} from '../../src/server/canonical-clickhouse.js';
import {ClickHouseStore} from '../../src/server/clickhouse-store.js';
import {ClickHouseFactStore} from '../../src/server/fact-store.js';
import {ClickHouseCacheStore} from '../../src/server/cache-store.js';
import {ClickHouseSessionHeaderStore} from '../../src/server/session-header-store.js';
import {ClickHouseRemainingFactStore} from '../../src/server/remaining-fact-store.js';
import {RemainingFactTransport} from '../../src/server/remaining-fact-transport.js';
describe('explicit SELECT server timeout preserves transport limits',()=>{
 it('uses fractional seconds without adding result/scan/memory settings',()=>{const url=new URL('http://localhost/?database=test');configureClickHouseSelect(url,1250);expect(Object.fromEntries(url.searchParams)).toEqual({database:'test',max_execution_time:'1.25',timeout_overflow_mode:'throw'});});
 for(const adapter of ['canonical','mirror','facts','cache','headers','remaining','transport'] as const)it(adapter+' opts SELECT in but leaves mutation calls unchanged',async()=>{
  const seen:URL[]=[];const config={url:'http://localhost/?database=test',username:'fixture',password:'not-real',timeoutMs:1250,fetch:async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{const u=new URL(String(input));seen.push(u);expect(new Headers(init?.headers).get('X-ClickHouse-User')).toBe('fixture');expect(init?.signal).toBeInstanceOf(AbortSignal);return new Response(u.searchParams.has('max_execution_time')?JSON.stringify({data:[{n:'0',count:'0'}]}):'',{status:200});}};
  if(adapter==='canonical'){const store=new CanonicalClickHouse(config);await store.expireBefore('site',new Date());}
  else if(adapter==='mirror'){const store=new ClickHouseStore(config);await store.initialize();await store.countExpired('site',new Date().toISOString());}
  else if(adapter==='facts'){const store=new ClickHouseFactStore(config);await store.initialize();await store.assertEmptyRun('site','run');}
  else if(adapter==='cache'){const store=new ClickHouseCacheStore(config);await store.initialize();await store.assertEmptyOwner('site','owner');}
  else if(adapter==='headers'){const store=new ClickHouseSessionHeaderStore(config);await store.initialize();await store.assertEmptyRun('site','run');}
  else if(adapter==='remaining'){const store=new ClickHouseRemainingFactStore(config);await store.initialize();await store.assertEmptyRun('site','run');}
  else {const store=new RemainingFactTransport(config);await store.command('CREATE TABLE test');await store.rows('SELECT count() n FROM test');}
  const selected=seen.at(-1)!;expect(selected.searchParams.get('max_execution_time')).toBe('1.25');expect(selected.searchParams.get('timeout_overflow_mode')).toBe('throw');for(const mutation of seen.slice(0,-1)){expect(mutation.searchParams.has('max_execution_time')).toBe(false);expect(mutation.searchParams.has('timeout_overflow_mode')).toBe(false);}expect(seen.length).toBeGreaterThan(1);
 });
});
