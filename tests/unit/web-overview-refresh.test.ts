import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {ReactNode} from 'react';

// A synchronous effect harness exercises the component's requests without a DOM
// or chart renderer. Requests deliberately ignore abort so stale-response guards
// are checked independently of the fetch implementation.
const hooks=vi.hoisted(()=>{
 type Slot={value?:unknown;deps?:readonly unknown[];cleanup?:()=>void};
 let slots:Slot[]=[],cursor=0,dirty=false,pending=new Map<number,()=>void|(()=>void)>();
 return {
  useState<T>(initial:T|(()=>T)):[T,(next:T|((previous:T)=>T))=>void]{
   const index=cursor++;if(!slots[index])slots[index]={value:typeof initial==='function'?(initial as()=>T)():initial};
   return [slots[index]!.value as T,next=>{const value=typeof next==='function'?(next as(previous:T)=>T)(slots[index]!.value as T):next;if(!Object.is(value,slots[index]!.value)){slots[index]!.value=value;dirty=true;}}];
  },
  useEffect(effect:()=>void|(()=>void),deps:readonly unknown[]){
   const index=cursor++,old=slots[index];
   if(!old||deps.length!==old.deps?.length||deps.some((dep,i)=>!Object.is(dep,old.deps?.[i]))){slots[index]={...old,deps};pending.set(index,effect);}
  },
  useRef<T>(initial:T){const index=cursor++;if(!slots[index])slots[index]={value:{current:initial}};return slots[index]!.value as {current:T};},
  render<T>(component:()=>T):T{
   let result:T;for(let pass=0;pass<20;pass++){
    cursor=0;dirty=false;result=component();const effects=pending;pending=new Map();
    for(const[index,effect]of effects){slots[index]!.cleanup?.();slots[index]!.cleanup=effect()||undefined;}
    if(!dirty)return result;
   }throw new Error('Effect harness did not settle');
  },
  unmount(){for(const slot of slots)slot.cleanup?.();slots=[];cursor=0;dirty=false;pending.clear();},
 };
});
const requests=vi.hoisted(()=>[] as {path:string;signal?:AbortSignal;resolve:(value:Record<string,unknown>)=>void}[]);
vi.mock('react',async()=>({...await vi.importActual<typeof import('react')>('react'),useState:hooks.useState,useEffect:hooks.useEffect,useRef:hooks.useRef}));
vi.mock('../../src/web/api',async()=>({...await vi.importActual<typeof import('../../src/web/api')>('../../src/web/api'),api:vi.fn((path:string,_body:unknown,_method:string,signal?:AbortSignal)=>new Promise<Record<string,unknown>>(resolve=>requests.push({path,signal,resolve})))}));

import {FiftyOneOverview} from '../../src/web/FiftyOneOverview';
import {useReportRead} from '../../src/web/DensePrimitives';
import {reportReadCache} from '../../src/web/reportReadCache';

type Props=Parameters<typeof FiftyOneOverview>[0];
let props:Props;
const query=new URLSearchParams({from:'2026-11-03T16:00:00.000Z',to:'2026-11-10T16:00:00.000Z'}).toString();
const traffic=(returning:number,unknown=0)=>({coverage:1,visitors:{new:0,returning,unknown},groups:{},days:[]});
const currentRequests=()=>requests.filter(request=>request.path.includes(`/traffic-report?${props.query}`));
function textIn(node:unknown,className?:string):string{
 if(node===null||node===undefined||typeof node==='boolean')return '';
 if(Array.isArray(node))return node.map(child=>textIn(child,className)).join(' ');
 if(typeof node==='string'||typeof node==='number')return className?'':String(node);
 const element=node as {props?:{className?:string;children?:ReactNode}};
 if(!element.props)return '';
 return textIn(element.props.children,className&&element.props.className!==className?className:undefined);
}
function clickSummaryToggle(node:unknown):boolean{
 if(Array.isArray(node))return node.some(clickSummaryToggle);
 if(!node||typeof node!=='object')return false;
 const element=node as {props?:{className?:string;children?:ReactNode;onClick?:()=>void}};
 if(element.props?.className==='l51-summary-expand'){element.props.onClick?.();return true;}
 return clickSummaryToggle(element.props?.children);
}
const render=()=>hooks.render(()=>FiftyOneOverview(props));
async function flush(){for(let i=0;i<5;i++)await Promise.resolve();}
async function settle(){await flush();return render();}

beforeEach(()=>{
 reportReadCache.identify('synthetic-user');reportReadCache.invalidate('mutation');
 vi.useFakeTimers();vi.stubGlobal('document',{visibilityState:'visible'});requests.length=0;
 props={site:{id:'synthetic-a',name:'Synthetic',domain:'example.test',timezone:'Asia/Shanghai',privacy_mode:'standard'},data:{},previous:{},compare:true,query,range:{from:'2026-11-04',to:'2026-11-10'},onRange:vi.fn(),onReport:vi.fn(),onFilter:vi.fn(),reportHref:report=>`/app?report=${report}`,filterHref:()=>'/app',refresh:0};
});
afterEach(()=>{hooks.unmount();reportReadCache.invalidate('mutation');vi.useRealTimers();vi.unstubAllGlobals();});

describe('overview live report refresh',()=>{
 it('renders the exact-site cached summary on the first remount without an empty live metric',async()=>{
  render();for(const request of requests)request.resolve(request.path.includes('/overview-summary')?{active15:{visitors:777}}:traffic(40));
  expect(textIn(await settle(),'l51-live-card')).toContain('777');hooks.unmount();
  expect(textIn(render(),'l51-live-card')).toContain('777');expect(requests).toHaveLength(4);
 });
 it('keeps normal and extended summary URLs separate, including when returning to a fresh cached variant',async()=>{
  render();requests.find(request=>request.path.endsWith('/overview-summary'))!.resolve({active15:{visitors:111}});await settle();
  expect(clickSummaryToggle(render())).toBe(true);expect(textIn(render(),'l51-live-card')).not.toContain('111');
  expect(requests.filter(request=>request.path.includes('/overview-summary'))).toHaveLength(2);
  requests.find(request=>request.path.endsWith('/overview-summary?extended=1'))!.resolve({active15:{visitors:222},extended:{thisMonth:{totals:{pv:987}}}});
  expect(textIn(await settle(),'l51-live-card')).toContain('222');
  clickSummaryToggle(render());expect(textIn(render(),'l51-live-card')).toContain('111');
  clickSummaryToggle(render());expect(textIn(render(),'l51-live-card')).toContain('222');expect(requests.filter(request=>request.path.includes('/overview-summary'))).toHaveLength(2);
  props={...props,site:{...props.site,id:'synthetic-b'}};const other=textIn(render(),'l51-live-card');expect(other).not.toContain('111');expect(other).not.toContain('222');
  expect(requests.at(-4)?.path).toContain('/synthetic-b/overview-summary?extended=1');
 });
 it('forces a new summary on manual refresh inside the TTL and on the 30-second tick',async()=>{
  render();requests.find(request=>request.path.includes('/overview-summary'))!.resolve({active15:{visitors:111}});await settle();
  props={...props,refresh:1};expect(textIn(render(),'l51-live-card')).toContain('111');
  let summaries=requests.filter(request=>request.path.includes('/overview-summary'));expect(summaries).toHaveLength(2);
  summaries[1]!.resolve({active15:{visitors:222}});expect(textIn(await settle(),'l51-live-card')).toContain('222');
  vi.advanceTimersByTime(30000);render();summaries=requests.filter(request=>request.path.includes('/overview-summary'));expect(summaries).toHaveLength(3);
 });
 it('clears summary data on writes and session expiry rather than displaying a cached success',async()=>{
  render();requests.find(request=>request.path.includes('/overview-summary'))!.resolve({active15:{visitors:111}});await settle();
  reportReadCache.invalidate('mutation');expect(textIn(render(),'l51-live-card')).not.toContain('111');
  const summaries=requests.filter(request=>request.path.includes('/overview-summary'));expect(summaries).toHaveLength(2);
  summaries[1]!.resolve({active15:{visitors:222}});expect(textIn(await settle(),'l51-live-card')).toContain('222');
  const count=requests.length;reportReadCache.invalidate('session');expect(textIn(render(),'l51-live-card')).not.toContain('222');expect(requests).toHaveLength(count);
 });
 it('replaces an early incomplete visitor classification on the next 30-second tick, including comparison and geography',async()=>{
  render();expect(requests).toHaveLength(4);
  const early=currentRequests()[0]!;early.resolve(traffic(10,30));
  expect(textIn(await settle(),'l51-visitor-summary')).toContain('25.00%');
  vi.advanceTimersByTime(30000);render();expect(requests).toHaveLength(8);
  // Completed reads need no transport cancellation; the next tick must still bypass their cached value.
  expect(currentRequests()).toHaveLength(2);
  expect(requests.filter(request=>request.path.includes('/geography?'))).toHaveLength(2);
  expect(requests.filter(request=>request.path.includes('/traffic-report?'))).toHaveLength(4);
  currentRequests()[1]!.resolve(traffic(40));
  const view=textIn(await settle(),'l51-visitor-summary');
  expect(view).toContain('40');expect(view).toContain('100.00%');expect(view).not.toContain('25.00%');
 });

 it('pauses automatic polling in a hidden tab and keeps manual refresh independent from timer ticks',()=>{
  render();vi.stubGlobal('document',{visibilityState:'hidden'});vi.advanceTimersByTime(60000);render();expect(requests).toHaveLength(4);
  props={...props,refresh:1};render();expect(requests).toHaveLength(8);
  vi.stubGlobal('document',{visibilityState:'visible'});vi.advanceTimersByTime(30000);render();expect(requests).toHaveLength(12);
  // Refresh counters can reset independently; (1,1) and (0,2) must not collide.
  props={...props,refresh:0};vi.advanceTimersByTime(30000);render();expect(requests).toHaveLength(16);
  render();expect(requests).toHaveLength(16);
 });

 it('ignores aborted traffic and summary promises that resolve after newer responses',async()=>{
  render();const first=[...requests];vi.advanceTimersByTime(30000);render();
  const latest=currentRequests()[1]!;latest.resolve(traffic(40));
  requests.filter(request=>request.path.includes('/overview-summary'))[1]!.resolve({active15:{visitors:777}});
  await settle();expect(first.every(request=>request.signal?.aborted)).toBe(true);
  first.find(request=>request.path.includes(`/traffic-report?${query}`))!.resolve(traffic(10,30));
  first.find(request=>request.path.includes('/overview-summary'))!.resolve({active15:{visitors:333}});
  const view=await settle();
  expect(textIn(view,'l51-visitor-summary')).toContain('100.00%');
  expect(textIn(view,'l51-live-card')).toContain('777');expect(textIn(view,'l51-live-card')).not.toContain('333');
 });

 it('cancels reads on site or range changes and clears the polling timer when unmounted',async()=>{
  render();const first=[...requests];props={...props,site:{...props.site,id:'synthetic-b'},compare:false};render();
  expect(first.every(request=>request.signal?.aborted)).toBe(true);expect(requests).toHaveLength(7);
  for(const request of first)request.resolve(traffic(99));
  expect(textIn(await settle(),'l51-visitor-summary')).not.toContain('99');
  const active=[...requests.slice(4)];props={...props,query:new URLSearchParams({from:'2026-11-08T16:00:00.000Z',to:'2026-11-09T16:00:00.000Z'}).toString(),range:{from:'2026-11-09',to:'2026-11-09'}};render();
  expect(active.filter(request=>!request.path.includes('/overview-summary')).every(request=>request.signal?.aborted)).toBe(true);
  expect(requests).toHaveLength(9);hooks.unmount();expect(requests.every(request=>request.signal?.aborted)).toBe(true);
  vi.advanceTimersByTime(60000);expect(requests).toHaveLength(9);expect(vi.getTimerCount()).toBe(0);
 });
});

describe('report hook route transitions',()=>{
 it('renders a fresh response on the first remount without another request or loading frame',async()=>{
  const url='/api/v1/sites/a/stats?from=one&to=two',data={pv:12};
  expect(hooks.render(()=>useReportRead(url)).data).toBeUndefined();requests[0]!.resolve(data);await flush();
  expect(hooks.render(()=>useReportRead(url)).data).toBe(data);hooks.unmount();
  expect(hooks.render(()=>useReportRead(url)).data).toBe(data);expect(requests).toHaveLength(1);
 });
 it('preserves the same URL while refreshing but clears data immediately for another query or site',async()=>{
  let url='/api/v1/sites/a/stats?from=one&to=two',version=0;const read=()=>hooks.render(()=>useReportRead(url,version,true));
  read();requests[0]!.resolve({pv:12});await flush();expect(read().data).toEqual({pv:12});
  version=1;expect(read().data).toEqual({pv:12});expect(requests).toHaveLength(2);
  url='/api/v1/sites/a/stats?from=two&to=three';expect(read().data).toBeUndefined();expect(requests[1]!.signal?.aborted).toBe(true);
  requests[2]!.resolve({pv:22});await flush();expect(read().data).toEqual({pv:22});
  url='/api/v1/sites/b/stats?from=two&to=three';expect(read().data).toBeUndefined();
 });
 it('reloads after a mutation and clears mounted data without re-requesting during session loss',async()=>{
  const url='/api/v1/sites/a/stats',read=()=>hooks.render(()=>useReportRead(url));
  read();requests[0]!.resolve({pv:1});await flush();expect(read().data).toEqual({pv:1});
  reportReadCache.invalidate('mutation');expect(read().data).toBeUndefined();expect(requests).toHaveLength(2);
  requests[1]!.resolve({pv:2});await flush();expect(read().data).toEqual({pv:2});
  reportReadCache.invalidate('session');expect(read().data).toBeUndefined();expect(requests).toHaveLength(2);
  reportReadCache.identify('next-user');read();expect(requests).toHaveLength(3);
 });
 it('retains an opted-in live window for short forward ticks only, and limits the age of the retained response',async()=>{
  const url=(from:number,to=from+30*60000,filter='direct',site='a')=>`/api/v1/sites/${site}/traffic-report?from=${new Date(from).toISOString()}&to=${new Date(to).toISOString()}&channel=${filter}`;
  const start=Date.parse('2026-11-10T00:00:00Z');let current=url(start);const read=()=>hooks.render(()=>useReportRead(current,0,true));
  read();requests[0]!.resolve({pv:11});await flush();expect(read().data).toEqual({pv:11});
  current=url(start+5000);expect(read().data).toEqual({pv:11});
  current=url(start+60_000);expect(read().data).toEqual({pv:11});
  // The limit is measured from the actual response, not the last unresolved polling request.
  current=url(start+65_000);expect(read().data).toBeUndefined();
  requests.at(-1)!.resolve({pv:12});await flush();expect(read().data).toEqual({pv:12});
  current=url(start+70_000,start+70_000+30*60000,'search');expect(read().data).toBeUndefined();
  requests.at(-1)!.resolve({pv:13});await flush();read();
  current=url(start+75_000,start+75_000+15*60000,'search');expect(read().data).toBeUndefined();
 });
 it('does not continue a backwards or next-day range, a changed site, or a read without live opt-in',async()=>{
  const start=Date.parse('2026-11-10T00:00:00Z'),url=(shift=0,site='a')=>`/api/v1/sites/${site}/visits?from=${new Date(start+shift).toISOString()}&to=${new Date(start+shift+60000).toISOString()}&pageSize=10`;
  for(const [next,optIn] of [[url(-5000),true],[url(86_400_000),true],[url(5000,'b'),true],[url(5000),false]] as const){
   let current=url();const read=()=>hooks.render(()=>useReportRead(current,0,optIn));read();requests.at(-1)!.resolve({pv:1});await flush();read();
   current=next;expect(read().data).toBeUndefined();hooks.unmount();reportReadCache.invalidate('mutation');
  }
 });
});
