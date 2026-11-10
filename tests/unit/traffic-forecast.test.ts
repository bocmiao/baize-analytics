import {describe,expect,it} from 'vitest';
import {buildForecastHistory,buildTrafficForecast,type ForecastDay,type ForecastInput,type ForecastTotals} from '../../src/server/traffic-forecast.js';
import type {AnalyticsEvent} from '../../src/server/analytics-core.js';

const totals=(value:number|null):ForecastTotals=>({pv:value,uv:value,ips:value,sessions:value});
const calendar={asOf:'2026-11-10T04:00:00Z',timezone:'Asia/Shanghai',dayStart:'2026-11-09T16:00:00Z',dayEnd:'2026-11-10T16:00:00Z'};
const day=(date:string,full=100,partial=50):ForecastDay=>({day:date,totals:totals(full),sameTimeTotals:totals(partial),coverage:1,sameTimeCoverage:1});
const forecast=(overrides:Partial<ForecastInput>={})=>buildTrafficForecast({...calendar,today:{totals:totals(50),coverage:1},history:[day('2026-11-09'),day('2026-11-08'),day('2026-11-07')],...overrides});
const ip=(letter:string)=>'v1:'+letter.repeat(64);
const page=(id:string,ts:string,visitor=id,ipId=ip('a')):AnalyticsEvent=>({site_id:'site-a',event_id:id,page_id:id,visitor_id:visitor,type:'pageview',ts,path:'/page',payload:{},dimensions:{client_ip_id:ipId}});
const history=(events:AnalyticsEvent[],overrides:Partial<Parameters<typeof buildForecastHistory>[1]>={})=>buildForecastHistory(events,{...calendar,historyFrom:'2026-11-06T16:00:00Z',historyCoverage:1,...overrides});

describe('transparent daily traffic forecast',()=>{
 it('uses exact historical remaining traffic and exposes its method and uncalibrated range',()=>{
  const result=forecast();expect(result).toMatchObject({pv:100,uv:100,ips:100,sessions:100,status:'estimated',coverage:1,sampleDays:3,algorithm:'historical_remaining_v1',intervalKind:'heuristic_not_calibrated'});
  expect(result.details.pv).toMatchObject({method:'historical_remaining',sampleDays:3,confidence:'low',interval:{kind:'heuristic_range'}});expect(result.details.pv.interval!.lower).toBeLessThanOrEqual(100);expect(result.details.pv.interval!.upper).toBeGreaterThanOrEqual(100);
 });
 it('does not add daily UV totals or treat missing IP identities as zero',()=>{
  const result=forecast({today:{totals:{...totals(50),ips:null},coverage:1}});expect(result.pv).toBe(100);expect(result.ips).toBeNull();expect(result.status).toBe('partially_estimated');expect(result.details.ips.status).toBe('unavailable');
 });
 it('excludes incomplete, impossible, duplicate, future and out-of-window samples',()=>{
  const result=forecast({history:[day('2026-11-09'),day('2026-11-09',9999),{...day('2026-11-08',500),coverage:0},day('2026-11-07',10,20),day('2026-11-10',900),day('2026-09-10',900)]});
  expect(result.pv).toBe(100);expect(result.details.pv).toMatchObject({sampleDays:1,method:'yesterday_remaining',sampleDates:['2026-11-09']});
 });
 it('blocks prediction when current coverage is incomplete',()=>{
  expect(forecast({today:{totals:totals(50),coverage:0.5}})).toMatchObject({pv:null,uv:null,ips:null,sessions:null,status:'unavailable'});
 });
 it('supports explicit yesterday and same-time data without a historical array',()=>{
  expect(forecast({history:[],yesterday:{totals:totals(100),coverage:1},yesterdaySameTime:{totals:totals(50),coverage:1}}).details.pv).toMatchObject({value:100,method:'yesterday_remaining',sampleDays:1});
 });
 it('keeps midnight estimates finite, including zero same-time traffic, and caps extreme growth',()=>{
  const result=forecast({asOf:calendar.dayStart,today:{totals:totals(0),coverage:1},history:[day('2026-11-09',100,0)]});expect(result.pv).toBe(100);
  const spike=forecast({today:{totals:totals(1000),coverage:1},history:[day('2026-11-09',100,0)]});expect(spike.pv).toBe(1400);expect(spike.details.pv.confidence).toBe('low');
 });
 it('waits for two hours and ten observations before using the labelled fallback',()=>{
  expect(forecast({history:[],asOf:'2026-11-09T16:01:00Z',today:{totals:totals(100),coverage:1}}).pv).toBeNull();
  expect(forecast({history:[],today:{totals:totals(9),coverage:1}}).pv).toBeNull();
  const result=forecast({history:[],today:{totals:totals(10),coverage:1}});expect(result.pv).toBe(20);expect(result.details.pv).toMatchObject({method:'run_rate',sampleDays:0,confidence:'low'});
 });
 it('returns observed totals at the actual end of the civil day even with no history or traffic',()=>{
  const result=forecast({asOf:calendar.dayEnd,history:[],today:{totals:totals(0),coverage:1}});expect(result.pv).toBe(0);expect(result.details.pv).toMatchObject({method:'observed_total',interval:{lower:0,upper:0}});
 });
 it('uses real 23/25 hour civil-day duration for fallback extrapolation',()=>{
  const spring=forecast({history:[],timezone:'America/New_York',dayStart:'2026-03-08T05:00:00Z',dayEnd:'2026-03-09T04:00:00Z',asOf:'2026-03-08T17:00:00Z',today:{totals:totals(120),coverage:1}});expect(spring.pv).toBe(230);
  const fall=forecast({history:[],timezone:'America/New_York',dayStart:'2026-11-01T04:00:00Z',dayEnd:'2026-11-02T05:00:00Z',asOf:'2026-11-01T16:00:00Z',today:{totals:totals(120),coverage:1}});expect(fall.pv).toBe(250);
 });
 it('rejects a UTC boundary passed for a non-UTC site civil day',()=>{expect(()=>forecast({dayStart:'2026-11-10T00:00:00Z',dayEnd:'2026-11-11T00:00:00Z'})).toThrow('civil day');});
 it('prefers same weekdays once three complete weekday samples exist',()=>{
  const result=forecast({history:[day('2026-11-03'),day('2026-10-27'),day('2026-10-20'),day('2026-11-09',1000,50)]});expect(result.pv).toBe(100);expect(result.details.pv.sampleDates).toEqual(['2026-10-20','2026-10-27','2026-11-03']);
 });
});

describe('forecast raw history',()=>{
 it('deduplicates pageviews and computes same-time UV/IP independently from the full-day totals',()=>{
  const first=page('a','2026-11-09T01:00:00Z','one'),later=page('b','2026-11-09T08:00:00Z','one'),other=page('c','2026-11-09T09:00:00Z','two',ip('b'));
  const result=history([first,first,later,other,page('today','2026-11-10T03:00:00Z'),page('future','2026-11-10T05:00:00Z')]);
  expect(result.yesterday!.totals).toEqual({pv:3,uv:2,ips:2,sessions:3});expect(result.yesterdaySameTime!.totals).toEqual({pv:1,uv:1,ips:1,sessions:1});expect(result.today.totals.pv).toBe(1);
 });
 it('includes covered zero days but excludes the partial first day and unavailable history',()=>{
  const result=history([],{historyFrom:'2026-11-07T01:00:00Z'});expect(result.history.map(item=>item.day)).toEqual(['2026-11-08','2026-11-09']);expect(result.yesterday!.totals).toEqual(totals(0));
  expect(history([],{historyCoverage:0,todayCoverage:1}).history).toEqual([]);
 });
 it('preserves daily-salt UV inside each day, suppresses IP and incomplete session context',()=>{
  const result=history([page('a','2026-11-09T01:00:00Z','one'),page('b','2026-11-09T02:00:00Z','one')],{privacy:true,sessionContextComplete:false});expect(result.yesterday!.totals).toEqual({pv:2,uv:1,ips:null,sessions:null});
 });
 it('never reports exact IP when legacy pageviews only have truncated addresses',()=>{
  const legacy=page('old','2026-11-09T01:00:00Z');legacy.dimensions={ip_truncated:'192.0.2.0'};expect(history([legacy]).yesterday!.totals.ips).toBeNull();
 });
 it('keeps sessions crossing midnight attributed to their original day',()=>{
  const result=history([page('before','2026-11-08T15:55:00Z','one'),page('after','2026-11-08T16:05:00Z','one')]);expect(result.history.find(item=>item.day==='2026-11-08')!.totals.sessions).toBe(1);expect(result.yesterday!.totals.sessions).toBe(0);expect(result.yesterday!.totals.pv).toBe(1);
 });
 it('uses site wall-clock time for same-time history across DST and applies content filters',()=>{
  const events=[page('before','2026-11-01T16:30:00Z'),page('after','2026-11-01T17:30:00Z')];
  const result=history(events,{timezone:'America/New_York',dayStart:'2026-11-02T05:00:00Z',dayEnd:'2026-11-03T05:00:00Z',asOf:'2026-11-02T17:00:00Z',historyFrom:'2026-10-31T04:00:00Z'});expect(result.yesterday!.totals.pv).toBe(2);expect(result.yesterdaySameTime!.totals.pv).toBe(1);
  expect(history([page('a','2026-11-09T01:00:00Z')],{filters:{path:'/other'}}).yesterday!.totals.pv).toBe(0);
 });
 it('handles a missing historical wall-clock time by moving through the DST gap',()=>{
  const result=history([page('before','2026-03-08T07:15:00Z'),page('after','2026-03-08T07:45:00Z')],{timezone:'America/New_York',dayStart:'2026-03-09T04:00:00Z',dayEnd:'2026-03-10T04:00:00Z',asOf:'2026-03-09T06:30:00Z',historyFrom:'2026-03-08T05:00:00Z'});
  expect(result.yesterday!.totals.pv).toBe(2);expect(result.yesterdaySameTime!.totals.pv).toBe(1);
 });
 it('uses the earlier instance of a repeated historical wall-clock time',()=>{
  const result=history([page('before','2026-11-01T05:15:00Z'),page('after','2026-11-01T06:15:00Z')],{timezone:'America/New_York',dayStart:'2026-11-02T05:00:00Z',dayEnd:'2026-11-03T05:00:00Z',asOf:'2026-11-02T06:30:00Z',historyFrom:'2026-11-01T04:00:00Z'});
  expect(result.yesterday!.totals.pv).toBe(2);expect(result.yesterdaySameTime!.totals.pv).toBe(1);
 });
});
