import {describe,it,expect} from 'vitest';
import {buildTrafficReport,buildLiveTraffic,filterVisits,isoWeek,visitorCounts,type TrafficModelOptions} from '../../src/server/51la-report-model.js';
import type {AnalyticsEvent} from '../../src/server/analytics-core.js';

function event(id:string,visitor:string,time:string,path='/',extra:Partial<AnalyticsEvent>={}):AnalyticsEvent{return {site_id:'site-a',event_id:id,visitor_id:visitor,page_id:id,type:'pageview',ts:time,path,payload:{url:'https://example.test'+path},dimensions:{channel:'search',referrer:'www.google.com',keyword:'analytics',browser:'Firefox',city:'Luoyang',ip_truncated:'192.0.2.0'},...extra};}
const options=(extra:Partial<TrafficModelOptions>={}):TrafficModelOptions=>({from:'2026-11-01T00:00:00.000Z',to:'2026-11-04T00:00:00.000Z',timezone:'UTC',privacy:false,timeoutMs:30*60000,firstSeen:new Map([['a','2026-10-30'],['b','2026-11-02']]),...extra});

describe('51LA real traffic model',()=>{
 it('unions visitors across days for week and month instead of adding daily UV',()=>{
  const report=buildTrafficReport([event('1','a','2026-11-02T01:00:00Z'),event('2','a','2026-11-03T01:00:00Z'),event('3','b','2026-11-03T01:00:00Z')],options());
  expect(report.days.map(d=>d.uv)).toEqual([1,2]);expect(report.groups.week[0]).toMatchObject({pv:3,uv:2,ips:null});expect(report.groups.month[0]?.uv).toBe(2);expect(report.visitors).toMatchObject({new:1,returning:1,unknown:0});
 });
 it('keeps IP uniqueness and ISP unknown even when distinct visitors share a prefix',()=>{
  const report=buildTrafficReport([event('1','a','2026-11-02T01:00:00Z'),event('2','b','2026-11-02T01:00:00Z')],options());
  expect(report.groups.ipPrefix).toEqual([expect.objectContaining({label:'192.0.2.0',pv:2,uv:2,ips:null})]);expect(report.groups.isp).toEqual([]);expect(report.totals.ips).toBeNull();
 });
 it('uses first-seen records and site calendar dates, leaving missing records unknown',()=>{
  const events=[event('1','a','2026-11-01T17:00:00Z'),event('2','b','2026-11-01T17:00:00Z'),event('3','missing','2026-11-01T17:00:00Z')];
  const report=buildTrafficReport(events,options({timezone:'Asia/Shanghai'}));
  expect(report.days[0]).toMatchObject({day:'2026-11-02',newVisitors:1,returningVisitors:1,unknownVisitors:1});expect(report.visits.map(v=>v.visitorType).sort()).toEqual(['new','returning','unknown']);expect(report.visitors.status).toBe('partial_first_seen');
 });
 it('does not infer a new visitor from a first-seen record later than the event',()=>{
  expect(visitorCounts([event('1','b','2026-11-01T17:00:00Z')],options())).toMatchObject({new:0,returning:0,unknown:1});
 });
 it('honors event filters and session entry rather than treating a mid-session page as an entry',()=>{
  const events=[event('1','a','2026-11-01T00:00:00Z','/landing'),event('2','a','2026-11-01T00:01:00Z','/target'),event('3','b','2026-11-01T01:00:00Z','/target')];
  const report=buildTrafficReport(events,options({filters:{path:'/target'}}));
  expect(report.totals).toMatchObject({pv:2,uv:2,sessions:1});expect(report.visits).toHaveLength(1);expect(report.visits[0]?.visitorKey).toBe('b');
 });
 it('excludes sessions already in progress at the range start and clips activity at the end',()=>{
  const events=[event('old','a','2026-10-31T23:59:00Z'),event('continuing','a','2026-11-01T00:01:00Z'),event('new','b','2026-11-01T00:05:00Z'),event('beat','b','2026-11-01T00:06:00Z','/',{type:'heartbeat'}),event('future','b','2026-11-01T00:15:00Z')];
  const report=buildTrafficReport(events,options({to:'2026-11-01T00:10:00Z'}));
  expect(report.totals).toMatchObject({pv:2,sessions:1,averageDuration:60});expect(report.visits.map(v=>v.visitorKey)).toEqual(['b']);
 });
 it('disables new/returning, IP prefixes, and cross-day distinct UV in daily-salt mode',()=>{
  const report=buildTrafficReport([event('1','salt1','2026-11-02T01:00:00Z'),event('2','salt2','2026-11-03T01:00:00Z')],options({privacy:true}));
  expect(report.totals.uv).toBeNull();expect(report.groups.month[0]?.uv).toBeNull();expect(report.days.map(d=>d.uv)).toEqual([1,1]);expect(report.visitors).toEqual({new:null,returning:null,unknown:null,status:'unsupported_in_this_mode'});expect(report.groups.ipPrefix).toEqual([]);expect(report.visits.every(v=>v.ipPrefix===null&&v.visitorType==='unknown')).toBe(true);
 });
 it('does not claim session counts when the lookback context is incomplete',()=>{
  const report=buildTrafficReport([event('1','a','2026-11-02T01:00:00Z')],options({sessionContextComplete:false}));
  expect(report.totals).toMatchObject({pv:1,uv:1,sessions:null,bounceRate:null,averageDuration:null});expect(report.engagement).toEqual({depth:[],duration:[]});
 });
 it('deduplicates events and returns actual channel/page trend metrics',()=>{
  const item=event('1','a','2026-11-02T01:00:00Z','/guide/intro');const report=buildTrafficReport([item,item],options());
  expect(report.totals.pv).toBe(1);expect(report.dimensionTrend.channel).toEqual([expect.objectContaining({label:'search',time:'2026-11-02',pv:1,uv:1})]);expect(report.groups.directory[0]?.label).toBe('/guide/');expect(report.groups.domain[0]?.label).toBe('example.test');expect(filterVisits(report.visits,{browser:'Chrome'})).toEqual([]);expect(filterVisits(report.visits,{entry:'/guide/intro'})).toHaveLength(1);
 });
 it('attributes an entry page to the whole actual session and keeps visitor-type daily trends',()=>{
  const report=buildTrafficReport([event('1','b','2026-11-02T01:00:00Z','/start'),event('2','b','2026-11-02T01:01:00Z','/second')],options());
  expect(report.groups.entry).toEqual([expect.objectContaining({label:'/start',pv:2,uv:1,sessions:1,averageDuration:60})]);expect(report.dimensionTrend.visitorType).toEqual([expect.objectContaining({time:'2026-11-02',label:'new',pv:2,uv:1,sessions:1})]);
 });
 it('suppresses all-period daily-salt UV even if only one date in the range has events',()=>{
  const report=buildTrafficReport([event('1','a','2026-11-02T01:00:00Z')],options({privacy:true}));expect(report.totals.uv).toBeNull();expect(report.days[0]?.uv).toBe(1);
 });
 it('classifies daily visitor-type trends by that date, independently of period cohorts',()=>{
  const report=buildTrafficReport([event('first','b','2026-11-01T17:00:00Z'),event('return','b','2026-11-02T17:00:00Z')],options({timezone:'Asia/Shanghai'}));
  expect(report.visitors).toMatchObject({new:1,returning:0});expect(report.groups.visitorType).toEqual([expect.objectContaining({label:'new',uv:1,newVisitors:1,returningVisitors:0})]);
  expect(report.dimensionTrend.visitorType).toEqual([expect.objectContaining({time:'2026-11-02',label:'new',uv:1,newVisitors:1,returningVisitors:0}),expect.objectContaining({time:'2026-11-03',label:'returning',uv:1,newVisitors:0,returningVisitors:1})]);
  expect(report.days.map(day=>[day.newVisitors,day.returningVisitors])).toEqual([[1,0],[0,1]]);expect(report.visits.map(row=>row.visitorType)).toEqual(['returning','new']);
 });
 it('includes per-dimension real new/returning visitor sets and corresponding week cohorts',()=>{
  const report=buildTrafficReport([event('1','b','2026-11-02T01:00:00Z'),event('2','b','2026-11-09T01:00:00Z'),event('3','a','2026-11-09T01:00:00Z')],options({to:'2026-11-10T00:00:00Z'}));
  expect(report.groups.browser[0]).toMatchObject({uv:2,newVisitors:1,returningVisitors:1,unknownVisitors:0});expect(report.groups.week.find(row=>row.label==='2026-W46')).toMatchObject({uv:2,newVisitors:0,returningVisitors:2});
 });
 it('returns site-local hour buckets with actual visitor types for a one-day range',()=>{
  const report=buildTrafficReport([event('1','b','2026-11-01T17:05:00Z'),event('2','a','2026-11-01T17:20:00Z'),event('3','b','2026-11-01T18:20:00Z')],options({from:'2026-11-01T16:00:00Z',to:'2026-11-02T16:00:00Z',timezone:'Asia/Shanghai'}));
  expect(report.hours).toHaveLength(24);expect(report.hours[1]).toMatchObject({time:'2026-11-01T17:00:00.000Z',pv:2,uv:2,newVisitors:1,returningVisitors:1});expect(report.hours[2]).toMatchObject({pv:1,uv:1,newVisitors:1,returningVisitors:0});expect(report.hours[0]).toMatchObject({pv:0,uv:0,newVisitors:0});
  expect(buildTrafficReport([],options()).hours).toEqual([]);
 });
 it('keeps daily-salt daily and hourly visitor types unavailable',()=>{
  const report=buildTrafficReport([event('1','b','2026-11-02T01:00:00Z')],options({from:'2026-11-02T00:00:00Z',to:'2026-11-03T00:00:00Z',privacy:true}));expect(report.hours[1]).toMatchObject({pv:1,uv:1,newVisitors:null,returningVisitors:null});expect(report.days[0]).toMatchObject({newVisitors:null,returningVisitors:null});expect(report.dimensionTrend.channel[0]).toMatchObject({newVisitors:null,returningVisitors:null});
 });
 it('handles ISO week years at calendar boundaries',()=>{expect(isoWeek('2021-01-01')).toBe('2020-W53');expect(isoWeek('2026-11-02')).toBe('2026-W45');});
 it('counts all recent events, not an arbitrary 200-entry preview',()=>{
  const events=Array.from({length:250},(_,n)=>event(String(n),String(n),'2026-11-02T11:59:00Z'));
  events.push(event('heartbeat','hb','2026-11-02T11:58:00Z','/',{type:'heartbeat'}),event('consent','consent','2026-11-02T11:58:00Z','/',{type:'consent'}),event('outside','out','2026-11-02T11:29:59Z'));
  const live=buildLiveTraffic(events,'2026-11-02T12:00:00Z','UTC',false);expect(live.active).toEqual({5:251,15:251,30:251});expect(live.pageviews.reduce((a,b)=>a+b,0)).toBe(250);expect(live.pages).toEqual([{path:'/',pv:250}]);
 });
 it('does not union daily-salt visitor IDs across midnight in live windows',()=>{
  const live=buildLiveTraffic([],'2026-11-02T00:10:00Z','UTC',true);expect(live.active).toEqual({5:0,15:null,30:null});
 });
});
