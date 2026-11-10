import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ReportReadCache} from '../../src/web/reportReadCache';
import {civilDate,inclusiveEnd} from '../../src/web/time';

// Run the real View function without main.tsx's application bootstrap. This
// harness captures the first render separately so an effect cannot hide a flash.
const source=ts.createSourceFile('main.tsx',readFileSync(new URL('../../src/web/main.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declaration=source.statements.find((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text==='View')!;
const jsxNames=new Set<string>();
function collect(node:ts.Node){if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){const name=node.tagName.getText(source);if(/^[A-Z]\w*$/.test(name))jsxNames.add(name);}ts.forEachChild(node,collect);}
collect(declaration);
const compiled=ts.transpileModule(declaration.getFullText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,module:ts.ModuleKind.None}}).outputText;

type Slot={value?:unknown;deps?:readonly unknown[];cleanup?:()=>void};
let slots:Slot[]=[],cursor=0,dirty=false,pending=new Map<number,()=>void|(()=>void)>();
function useState<T>(initial:T|(()=>T)):[T,(value:T|((previous:T)=>T))=>void]{const index=cursor++;if(!slots[index])slots[index]={value:typeof initial==='function'?(initial as()=>T)():initial};return[slots[index]!.value as T,value=>{const next=typeof value==='function'?(value as(previous:T)=>T)(slots[index]!.value as T):value;if(!Object.is(next,slots[index]!.value)){slots[index]!.value=next;dirty=true;}}];}
function useRef<T>(initial:T){const index=cursor++;if(!slots[index])slots[index]={value:{current:initial}};return slots[index]!.value as {current:T};}
function useEffect(effect:()=>void|(()=>void),deps:readonly unknown[]){const index=cursor++,previous=slots[index];if(!previous||deps.length!==previous.deps?.length||deps.some((value,i)=>!Object.is(value,previous.deps?.[i]))){slots[index]={...previous,deps};pending.set(index,effect);}}
function unmount(){for(const slot of slots)slot.cleanup?.();slots=[];cursor=0;dirty=false;pending.clear();}
type Tree={type:unknown;props:Record<string,any>};
type Request={path:string;signal?:AbortSignal;resolve:(data:Record<string,unknown>)=>void;reject:(error:Error)=>void};
let cache:ReportReadCache,requests:Request[],View:(props:any)=>Tree,props:any;
function firstRender(){cursor=0;dirty=false;return View(props);}
function render(){let tree=firstRender();for(let pass=0;pass<20;pass++){const effects=pending;pending=new Map();for(const[index,effect]of effects){slots[index]!.cleanup?.();slots[index]!.cleanup=effect()||undefined;}if(!dirty)return tree;tree=firstRender();}throw new Error('View effects did not settle');}
function find(node:any,type:string):Tree|undefined{if(Array.isArray(node)){for(const item of node){const result=find(item,type);if(result)return result;}return;}if(!node||typeof node!=='object')return;if(node.type===type)return node;return find(node.props?.children,type);}
function locationOf(node:any,type:string,path='root'):string|undefined{if(Array.isArray(node)){for(let i=0;i<node.length;i++){const found=locationOf(node[i],type,`${path}[${i}]`);if(found)return found;}return;}if(!node||typeof node!=='object')return;if(node.type===type)return path;return locationOf(node.props?.children,type,path+'.children');}
const overview=(tree:Tree)=>find(tree,'FiftyOneOverview');
const stats=()=>requests.filter(request=>request.path.includes('/stats?')&&!request.path.includes('previous=1'));
const previous=()=>requests.filter(request=>request.path.includes('previous=1'));
async function flush(){for(let i=0;i<12;i++)await Promise.resolve();}
async function settle(){await flush();return render();}
const result=(pv:number,coverage=1)=>({coverage,totals:{pv},pages:[],sources:[],trend:[]});

beforeEach(()=>{
 vi.useFakeTimers();vi.stubGlobal('document',{visibilityState:'visible'});requests=[];cache=new ReportReadCache();
 const api=(path:string,_body?:unknown,_method?:string,signal?:AbortSignal)=>path.endsWith('/goals')||path.endsWith('/funnels')?Promise.resolve({rows:[]}):new Promise<Record<string,unknown>>((resolve,reject)=>requests.push({path,signal,resolve,reject}));
 const environment={...Object.fromEntries([...jsxNames].map(name=>[name,name])),React,useState,useEffect,useRef,civilDate,inclusiveEnd,reportReadCache:cache,peekReport:(path:string)=>cache.peek(path),readReport:(path:string,signal?:AbortSignal,options={})=>cache.read(path,shared=>api(path,undefined,'GET',shared),{...options,signal}),api,FiftyOneOverview:'FiftyOneOverview',LegacyOverviewDashboard:'LegacyOverviewDashboard',setChartTimezone:()=>{},safePreviousDateSelection:(query:string)=>({ok:true,query:query+'&previous=1'}),supportsReport:()=>false,rows:(value:unknown)=>Array.isArray(value)?value:[],language:()=> 'zh-CN',t:(value:string)=>value,reportFilterKeys:[],tabs:[],labels:{},customerRecords:(value:unknown)=>value,ownValue:(value:Record<string,unknown>,key:string)=>value[key]};
 View=new Function(...Object.keys(environment),compiled+'\nreturn View;')(...Object.values(environment));
 props={range:{from:'2026-11-09',to:'2026-11-10'},onRange:vi.fn(),compare:false,profile:{profile:'standard',capabilities:{trafficReports:true}},site:{id:'a',name:'A',domain:'a.test',timezone:'UTC',privacy_mode:'standard'},tab:'overview',query:'from=2026-11-09T00%3A00%3A00Z&to=2026-11-11T00%3A00%3A00Z',refresh:0,canWrite:false,canAdmin:false,instanceAdmin:false,onReport:vi.fn(),onFilter:vi.fn(),reportHref:()=>'/app',filterHref:()=>'/app'};
});
afterEach(()=>{unmount();cache.invalidate('mutation');vi.useRealTimers();vi.unstubAllGlobals();});

describe('View report cache and refresh state',()=>{
 it('mounts standard overview while parent stats are pending and keeps its reconciliation position after success or failure',async()=>{
  const pending=render(),mounted=overview(pending),position=locationOf(pending,'FiftyOneOverview');
  expect(mounted).toBeDefined();expect(mounted?.props.data).toEqual({});expect(find(pending,'AnalysisState')).toBeUndefined();
  expect(stats()).toHaveLength(1);stats()[0]!.resolve(result(12));const loaded=await settle();
  expect(overview(loaded)?.props.data.totals.pv).toBe(12);expect(locationOf(loaded,'FiftyOneOverview')).toBe(position);
  unmount();cache.invalidate('mutation');const retry=render();stats()[1]!.reject(new Error('parent stats unavailable'));const failed=await settle();
  expect(locationOf(failed,'FiftyOneOverview')).toBe(locationOf(retry,'FiftyOneOverview'));expect(overview(failed)?.props.data).toEqual({});
  expect(JSON.stringify(failed)).toContain('parent stats unavailable');
 });
 it('retains the original loading gate for Lite overview and other report tabs',()=>{
  props={...props,profile:{profile:'lite',capabilities:{trafficReports:false}}};const lite=render();expect(find(lite,'LegacyOverviewDashboard')).toBeUndefined();expect(lite.props.className).toBe('panel baize-loading');
  unmount();props={...props,tab:'pages',profile:{profile:'standard',capabilities:{trafficReports:true}}};const pages=render();expect(pages.props.className).toBe('panel baize-loading');
 });
 it('renders fresh stats on the first remount without a loading frame, and expires after ten seconds',async()=>{
  render();stats()[0]!.resolve(result(12));expect(overview(await settle())?.props.data.totals.pv).toBe(12);unmount();
  expect(overview(firstRender())?.props.data.totals.pv).toBe(12);render();await settle();expect(stats()).toHaveLength(1);
  unmount();vi.advanceTimersByTime(10_001);expect(overview(firstRender())?.props.data).toEqual({});render();expect(stats()).toHaveLength(2);
 });
 it('forces explicit refresh while preserving the successful chart through a failed refresh',async()=>{
  render();stats()[0]!.resolve(result(12));await settle();props={...props,refresh:1};
  expect(overview(render())?.props.data.totals.pv).toBe(12);expect(stats()).toHaveLength(2);
  stats()[1]!.reject(new Error('temporary failure'));expect(overview(await settle())?.props.data.totals.pv).toBe(12);
  props={...props,refresh:2};render();stats()[2]!.resolve(result(15));expect(overview(await settle())?.props.data.totals.pv).toBe(15);
 });
 it('never presents another date, filter or site response even before effects run',async()=>{
  render();stats()[0]!.resolve(result(12));await settle();
  props={...props,query:props.query+'&channel=search'};expect(overview(firstRender())?.props.data).toEqual({});render();
  stats()[1]!.resolve(result(25));await settle();props={...props,query:props.query.replace('2026-11-09','2026-11-08')};
  expect(overview(firstRender())?.props.data).toEqual({});render();const abandoned=stats()[2]!;
  props={...props,site:{...props.site,id:'b'}};expect(overview(firstRender())?.props.data).toEqual({});render();
  abandoned.resolve(result(99));await settle();expect(overview(render())?.props.data).toEqual({});
  stats()[3]!.resolve(result(30));expect(overview(await settle())?.props.data.totals.pv).toBe(30);
 });
 it('forces pending-aggregation polls and refreshes comparison once on completion',async()=>{
  props={...props,compare:true};render();stats()[0]!.resolve(result(12,.5));previous()[0]!.resolve(result(8));await settle();
  vi.advanceTimersByTime(2000);expect(stats()).toHaveLength(2);expect(overview(render())?.props.data.totals.pv).toBe(12);
  stats()[1]!.resolve(result(14,1));await settle();expect(previous()).toHaveLength(2);
  previous()[1]!.resolve(result(9));expect(overview(await settle())?.props.previous.totals.pv).toBe(9);
  vi.advanceTimersByTime(6000);render();expect(stats()).toHaveLength(2);expect(previous()).toHaveLength(2);
 });
 it('does not duplicate comparison reads when the first stats response is already complete',async()=>{
  props={...props,compare:true};render();stats()[0]!.resolve(result(12));previous()[0]!.resolve(result(8));await settle();
  vi.advanceTimersByTime(6000);render();expect(stats()).toHaveLength(1);expect(previous()).toHaveLength(1);
  props={...props,query:props.query+'&path=%2Fnew'};expect(overview(firstRender())?.props.data).toEqual({});render();
  stats()[1]!.resolve(result(2));expect(overview(await settle())?.props.previous).toEqual({});
 });
 it('does not pair a cached new range with the previous range comparison on its first render',async()=>{
  props={...props,compare:true};render();stats()[0]!.resolve(result(12));previous()[0]!.resolve(result(8));await settle();
  const query=props.query+'&channel=direct';await cache.read(`/api/v1/sites/a/stats?${query}`,async()=>result(44));
  props={...props,query};const first=overview(firstRender());
  expect(first?.props.data.totals.pv).toBe(44);expect(first?.props.previous).toEqual({});render();
 });
 it('retains explicit refresh data but clears mutations and suspended sessions immediately',async()=>{
  render();stats()[0]!.resolve(result(12));await settle();cache.invalidate('refresh');
  expect(overview(render())?.props.data.totals.pv).toBe(12);expect(stats()).toHaveLength(2);
  stats()[1]!.resolve(result(13));await settle();cache.invalidate('mutation');expect(overview(firstRender())?.props.data).toEqual({});render();expect(stats()).toHaveLength(3);
  stats()[2]!.resolve(result(14));await settle();cache.invalidate('session');expect(overview(firstRender())).toBeUndefined();render();expect(stats()).toHaveLength(3);
 });
 it('does not use the report cache for sensitive management records',async()=>{
  props={...props,tab:'tokens'};const path=`/api/v1/sites/a/tokens?${props.query}`;
  await cache.read(path,async()=>({rows:[{id:'must-not-be-read'}]}));render();
  expect(requests).toHaveLength(1);expect(requests[0]!.path).toBe(path);
  requests[0]!.resolve({rows:[]});await settle();unmount();render();expect(requests).toHaveLength(2);
 });
});
