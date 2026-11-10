import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ReportReadCache,reportReadCache} from '../../src/web/reportReadCache';
import {api,apiReadMetadata,invalidateReportReads,peekReport,readReport} from '../../src/web/api';

function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const path='/api/v1/sites/one/traffic-report?from=2026-11-01&to=2026-11-02&channel=direct';

describe('bounded session-local report reads',()=>{
 it('coalesces concurrent exact URLs and retains response identity on a fresh remount',async()=>{
  const cache=new ReportReadCache(),pending=deferred<object>(),load=vi.fn(()=>pending.promise),value={pv:10};
  const first=cache.read(path,load),second=cache.read(path,load);expect(load).toHaveBeenCalledOnce();
  pending.resolve(value);expect(await first).toBe(value);expect(await second).toBe(value);
  expect(cache.peek(path)).toBe(value);expect(await cache.read(path,load)).toBe(value);expect(load).toHaveBeenCalledOnce();
 });
 it('isolates every site, endpoint, date, filter and repeated query value',async()=>{
  const cache=new ReportReadCache(),urls=[path,path.replace('/one/','/two/'),path.replace('traffic-report','stats'),path.replace('11-02','11-03'),path.replace('direct','search'),`${path}&channel=search`,`${path}&compare=previous`],load=vi.fn(async()=>({pv:1}));
  for(const url of urls)await cache.read(url,load);expect(load).toHaveBeenCalledTimes(urls.length);
  for(const url of urls)expect(cache.peek(url)).toBeDefined();
 });
 it('expires after the short freshness window and evicts the least recently read entry',async()=>{
  let now=0;const cache=new ReportReadCache(100,2,()=>now),load=vi.fn(async()=>({pv:1}));
  await cache.read('/a',load);await cache.read('/b',load);await cache.read('/a',load);await cache.read('/c',load);
  expect(cache.peek('/b')).toBeUndefined();expect(cache.peek('/a')).toBeDefined();expect(cache.peek('/c')).toBeDefined();
  now=100;expect(cache.peek('/a')).toBeUndefined();await cache.read('/c',load);expect(load).toHaveBeenCalledTimes(4);
 });
 it('never caches failed requests, including rejection without an error value',async()=>{
  const cache=new ReportReadCache(),load=vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockRejectedValueOnce(undefined).mockResolvedValue({pv:2});
  await expect(cache.read(path,load)).rejects.toThrow('unavailable');expect(cache.peek(path)).toBeUndefined();
  await expect(cache.read(path,load)).rejects.toBeUndefined();expect(cache.peek(path)).toBeUndefined();
  await expect(cache.read(path,load)).resolves.toEqual({pv:2});expect(load).toHaveBeenCalledTimes(3);
 });
 it('cancels one subscriber without cancelling another consumer of the same request',async()=>{
  const cache=new ReportReadCache(),pending=deferred<object>(),first=new AbortController(),second=new AbortController();let shared!:AbortSignal;
  const load=vi.fn((signal:AbortSignal)=>{shared=signal;return pending.promise;});
  const a=cache.read(path,load,{signal:first.signal}),b=cache.read(path,load,{signal:second.signal}),rejected=expect(a).rejects.toMatchObject({name:'AbortError'});
  first.abort();await rejected;expect(shared.aborted).toBe(false);pending.resolve({pv:3});await expect(b).resolves.toEqual({pv:3});expect(load).toHaveBeenCalledOnce();
 });
 it('aborts the last departed consumer and ignores a transport that resolves anyway',async()=>{
  const cache=new ReportReadCache(),pending=deferred<object>(),controller=new AbortController();let shared!:AbortSignal;
  const request=cache.read(path,signal=>{shared=signal;return pending.promise;},{signal:controller.signal});const rejected=expect(request).rejects.toMatchObject({name:'AbortError'});
  controller.abort();await rejected;expect(shared.aborted).toBe(true);pending.resolve({pv:99});await Promise.resolve();expect(cache.peek(path)).toBeUndefined();
  await expect(cache.read(path,async()=>({pv:1}))).resolves.toEqual({pv:1});
 });
 it('bypasses fresh values on explicit refresh and coalesces one refresh cohort',async()=>{
  const cache=new ReportReadCache();await cache.read(path,async()=>({pv:1}));
  const pending=deferred<object>(),load=vi.fn(()=>pending.promise),a=cache.read(path,load,{force:true,refreshKey:1}),b=cache.read(path,load,{force:true,refreshKey:1});
  expect(load).toHaveBeenCalledOnce();expect(cache.peek(path)).toBeUndefined();pending.resolve({pv:2});await a;await b;expect(cache.peek(path)).toEqual({pv:2});
 });
 it('does not reuse an older in-flight request when a newer refresh is requested',async()=>{
  const cache=new ReportReadCache(),old=deferred<object>(),fresh=deferred<object>();let oldSignal!:AbortSignal;
  const a=cache.read(path,signal=>{oldSignal=signal;return old.promise;}),b=cache.read(path,()=>fresh.promise,{force:true,refreshKey:2});
  fresh.resolve({pv:2});await b;old.resolve({pv:1});await a;
  expect(oldSignal.aborted).toBe(false);expect(cache.peek(path)).toEqual({pv:2});
 });
 it('invalidates cache hits before delivery as well as pending work on session loss',async()=>{
  const cache=new ReportReadCache();await cache.read(path,async()=>({private:true}));
  const hit=cache.read(path,async()=>({private:true})),pending=deferred<object>(),other=cache.read('/other',()=>pending.promise);
  const assertions=[expect(hit).rejects.toMatchObject({name:'AbortError'}),expect(other).rejects.toMatchObject({name:'AbortError'})];cache.invalidate('session');await Promise.all(assertions);
  pending.resolve({private:true});await Promise.resolve();expect(cache.peek(path)).toBeUndefined();expect(cache.peek('/other')).toBeUndefined();
  const loader=vi.fn(async()=>({private:false}));await expect(cache.read(path,loader)).rejects.toMatchObject({name:'AbortError'});expect(loader).not.toHaveBeenCalled();
  cache.identify('another-user');await expect(cache.read(path,loader)).resolves.toEqual({private:false});
 });
 it('keeps an unchanged identity but clears all data when the authenticated user changes',async()=>{
  const cache=new ReportReadCache();cache.identify('a');await cache.read(path,async()=>({private:'a'}));
  cache.identify('a');expect(cache.peek(path)).toEqual({private:'a'});cache.identify('b');expect(cache.peek(path)).toBeUndefined();
 });
 it('does not start an already cancelled read and cancels a synchronous cache hit before delivery',async()=>{
  const cache=new ReportReadCache(),controller=new AbortController(),load=vi.fn(async()=>({pv:1}));controller.abort();
  await expect(cache.read(path,load,{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});expect(load).not.toHaveBeenCalled();
  await cache.read(path,load);const cachedController=new AbortController(),hit=cache.read(path,load,{signal:cachedController.signal});cachedController.abort();
  await expect(hit).rejects.toMatchObject({name:'AbortError'});expect(load).toHaveBeenCalledOnce();
 });
 it('can cancel all active work even after the pending dedup index reaches its bound',async()=>{
  const cache=new ReportReadCache(100,2),signals:AbortSignal[]=[],wait=deferred<object>();
  const reads=['/a','/b','/c'].map(url=>cache.read(url,signal=>{signals.push(signal);return wait.promise;}));
  const assertions=reads.map(read=>expect(read).rejects.toMatchObject({name:'AbortError'}));cache.invalidate('mutation');await Promise.all(assertions);
  expect(signals.every(signal=>signal.aborted)).toBe(true);wait.resolve({pv:9});await Promise.resolve();expect(cache.peek('/a')).toBeUndefined();expect(cache.peek('/c')).toBeUndefined();
 });
});

beforeEach(()=>{reportReadCache.identify('test-user');invalidateReportReads('mutation');vi.stubGlobal('localStorage',{getItem:()=> 'zh-CN'});});
afterEach(()=>{invalidateReportReads('mutation');vi.unstubAllGlobals();});

describe('API report cache authentication and mutation boundaries',()=>{
 it('preserves the metadata WeakMap entry across cached reads without cloning the payload',async()=>{
  const fetch=vi.fn(async()=>new Response('[{"pv":1}]',{headers:{'X-Baize-Read-Coverage':'0.5','X-Baize-Read-Status':'partial'}}));vi.stubGlobal('fetch',fetch);
  const first=await readReport(path),second=await readReport(path);expect(second).toBe(first);expect(peekReport(path)).toBe(first);
  expect(apiReadMetadata(second)).toMatchObject({coverage:0.5,status:'partial'});expect(fetch).toHaveBeenCalledOnce();
 });
 it('invalidates successful JSON and empty-body writes but retains cache after a rejected mutation',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(_url:string,init:RequestInit)=>new Response(JSON.stringify(init.method==='GET'?{pv:1}:{ok:true}))));
  await readReport(path);await api('/api/v1/sites/one',{name:'New'},'PATCH');expect(peekReport(path)).toBeUndefined();
  await readReport(path);vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:204})));await api('/api/v1/sites/one/rules/a',{},'DELETE');expect(peekReport(path)).toBeUndefined();
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('{"pv":1}')));await readReport(path);
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('{"error":"rejected"}',{status:400})));await expect(api('/api/v1/sites/one',{})).rejects.toMatchObject({status:400});expect(peekReport(path)).toEqual({pv:1});
 });
 it('clears success and ignores late responses immediately on a malformed 401, then restores after /me',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('{"pv":7}')));await readReport(path);
  const late=deferred<Response>();vi.stubGlobal('fetch',vi.fn((url:string)=>url==='/api/expired'?Promise.resolve(new Response('expired',{status:401})):late.promise));
  const stale=readReport('/api/v1/sites/one/stats'),assertion=expect(stale).rejects.toMatchObject({name:'AbortError'});
  await expect(api('/api/expired')).rejects.toMatchObject({status:401});await assertion;expect(peekReport(path)).toBeUndefined();
  late.resolve(new Response('{"pv":999}'));await Promise.resolve();await Promise.resolve();expect(peekReport('/api/v1/sites/one/stats')).toBeUndefined();
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(JSON.stringify(url==='/api/me'?{user:{id:'new-user'}}:{pv:2}))));
  await api('/api/me');await expect(readReport(path)).resolves.toEqual({pv:2});
 });
 it('prevents direct GET success after a different request expires the session',async()=>{
  const late=deferred<Response>();vi.stubGlobal('fetch',vi.fn((url:string)=>url==='/api/expired'?Promise.resolve(new Response('{}',{status:401})):late.promise));
  const old=api('/api/me'),assertion=expect(old).rejects.toMatchObject({name:'AbortError'});await api('/api/expired').catch(()=>{});
  late.resolve(new Response('{"user":{"id":"old-user"}}'));await assertion;expect(reportReadCache.suspended).toBe(true);
 });
 it('clears previous account responses on a new /me identity and on logout',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(JSON.stringify(url==='/api/me'?{user:{id:'different-user'}}:{pv:1}))));
  await readReport(path);await api('/api/me');expect(peekReport(path)).toBeUndefined();await readReport(path);
  await api('/api/logout',{});expect(peekReport(path)).toBeUndefined();expect(reportReadCache.suspended).toBe(true);
 });
});
