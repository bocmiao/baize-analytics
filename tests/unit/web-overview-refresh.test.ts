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
vi.mock('react',async()=>({...await vi.importActual<typeof import('react')>('react'),useState:hooks.useState,useEffect:hooks.useEffect}));
vi.mock('../../src/web/api',async()=>({...await vi.importActual<typeof import('../../src/web/api')>('../../src/web/api'),api:vi.fn((path:string,_body:unknown,_method:string,signal?:AbortSignal)=>new Promise<Record<string,unknown>>(resolve=>requests.push({path,signal,resolve})))}));

import {FiftyOneOverview} from '../../src/web/FiftyOneOverview';

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
const render=()=>hooks.render(()=>FiftyOneOverview(props));
async function settle(){await Promise.resolve();await Promise.resolve();return render();}

beforeEach(()=>{
 vi.useFakeTimers();vi.stubGlobal('document',{visibilityState:'visible'});requests.length=0;
 props={site:{id:'synthetic-a',name:'Synthetic',domain:'example.test',timezone:'Asia/Shanghai',privacy_mode:'standard'},data:{},previous:{},compare:true,query,range:{from:'2026-11-04',to:'2026-11-10'},onRange:vi.fn(),onReport:vi.fn(),onFilter:vi.fn(),reportHref:report=>`/app?report=${report}`,filterHref:()=>'/app',refresh:0};
});
afterEach(()=>{hooks.unmount();vi.useRealTimers();vi.unstubAllGlobals();});

describe('overview live report refresh',()=>{
 it('replaces an early incomplete visitor classification on the next 30-second tick, including comparison and geography',async()=>{
  render();expect(requests).toHaveLength(4);
  const early=currentRequests()[0]!;early.resolve(traffic(10,30));
  expect(textIn(await settle(),'l51-visitor-summary')).toContain('25.00%');
  vi.advanceTimersByTime(30000);render();expect(requests).toHaveLength(8);
  expect(early.signal?.aborted).toBe(true);
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
