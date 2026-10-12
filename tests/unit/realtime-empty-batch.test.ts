import {it,expect,vi,afterEach} from 'vitest';
import type {FastifyInstance} from 'fastify';
import type {AppContext} from '../../src/server/context.js';
import {registerAnalytics} from '../../src/server/analytics.js';
import * as store from '../../src/server/event-store.js';
vi.mock('../../src/server/event-store.js',async()=>({...await vi.importActual('../../src/server/event-store.js'),readSiteEvents:vi.fn(async()=>({events:[],coverage:1}))}));
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
it('idle SSE skips hydration, still checks authorization, resumes new events and closes on revocation',async()=>{
 vi.useFakeTimers();const routes=new Map<string,(req:unknown,reply:unknown)=>Promise<void>>();const app={get:(path:string,fn:(req:unknown,reply:unknown)=>Promise<void>)=>routes.set(path,fn),post:vi.fn(),put:vi.fn(),delete:vi.fn()} as unknown as FastifyInstance;
 const authorize=vi.fn(async()=>({id:'u'})),query=vi.fn(async()=>({rows:[] as {cursor_id:string;event_id:string}[]}));const ctx={authorize,pool:{query}} as unknown as AppContext;await registerAnalytics(app,ctx);
 const write=vi.fn(),end=vi.fn(),on=vi.fn();const req={params:{siteId:'s'},headers:{'last-event-id':'17'}};const reply={hijack:vi.fn(),raw:{writeHead:vi.fn(),write,end,on}};
 await routes.get('/api/v1/sites/:siteId/realtime/stream')!(req,reply);expect(store.readSiteEvents).not.toHaveBeenCalled();expect(write).toHaveBeenCalledWith(': heartbeat\n\n');expect(query.mock.calls[0]).toEqual(expect.arrayContaining([expect.any(String),['s','17']]));
 await vi.advanceTimersByTimeAsync(2000);expect(store.readSiteEvents).not.toHaveBeenCalled();expect(authorize).toHaveBeenCalledTimes(3);
 query.mockResolvedValueOnce({rows:[{cursor_id:'18',event_id:'event'}]});vi.mocked(store.readSiteEvents).mockResolvedValueOnce({events:[{site_id:'s',event_id:'event',ts:new Date(),visitor_id:'v',page_id:'p',type:'pageview',path:'/a',payload:{},dimensions:{}}],coverage:1} as unknown as Awaited<ReturnType<typeof store.readSiteEvents>>);
 await vi.advanceTimersByTimeAsync(2000);expect(store.readSiteEvents).toHaveBeenCalledTimes(1);expect(write.mock.calls.some(([text])=>String(text).includes('id: 18'))).toBe(true);
 authorize.mockRejectedValueOnce(Error('revoked'));await vi.advanceTimersByTimeAsync(2000);expect(end).toHaveBeenCalledTimes(1);const reads=query.mock.calls.length;await vi.advanceTimersByTimeAsync(4000);expect(query).toHaveBeenCalledTimes(reads);
});
