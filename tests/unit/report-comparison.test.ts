import {describe,it,expect} from 'vitest';
import {buildTrafficReport,type TrafficModelOptions} from '../../src/server/51la-report-model.js';
import {trafficRangeSchema} from '../../src/server/51la-reports.js';
import {networkIPIdentity,publicIPKey} from '../../src/server/network-ip.js';
import type {AnalyticsEvent} from '../../src/server/analytics-core.js';
import {buildTrendComparison,comparisonCalendar,comparisonSelection} from '../../src/web/reportComparisonModel.js';
import {dateRange} from '../../src/web/time.js';
const identity=networkIPIdentity('192.0.2.1','site','secret')!;
const event=(id:string,date:string,city='A',known=true):AnalyticsEvent=>({site_id:'site',event_id:id,visitor_id:id,page_id:id,type:'pageview',ts:date+'T12:00:00Z',path:'/',payload:{},dimensions:{city,...known?{client_ip_id:identity}:{}}});
const currentQuery=dateRange('2026-11-04','2026-11-06','UTC'),previousQuery=dateRange('2026-11-01','2026-11-03','UTC');
function report(events:AnalyticsEvent[],query=currentQuery,extra:Partial<TrafficModelOptions>={}){const p=new URLSearchParams(query);return {coverage:1,...buildTrafficReport(events,{from:p.get('from')!,to:p.get('to')!,timezone:'UTC',privacy:false,timeoutMs:1800000,firstSeen:new Map(),trendDimensions:['city'],...extra})};}
describe('fixed-group calendar report comparisons',()=>{
 it('keeps a current leader when that group ranks sixth in the comparison period',()=>{
  const today=['A','B','C','D','E'].flatMap((city,index)=>Array.from({length:6-index},(_,n)=>event(city+n,'2026-11-04',city)));
  const yesterday=['B','C','D','E','F','A'].flatMap((city,index)=>Array.from({length:6-index},(_,n)=>event(city+n,'2026-11-01',city)));
  const current=report(today),leaders=comparisonSelection(current,'city');expect(leaders).toEqual(['A','B','C','D','E']);
  expect(comparisonSelection(report(yesterday,previousQuery),'city')).not.toContain('A');
  const previous=report(yesterday,previousQuery,{trendLabels:leaders}),chart=buildTrendComparison(current,previous,currentQuery,previousQuery,'UTC','city','pv');
  expect(chart.series.find(series=>series.name==='A · 对比期')?.values).toEqual([1,0,0]);
 });
 it('aligns sparse days by their calendar position and returns zero totals for an absent selected group',()=>{
  const current=report([event('a','2026-11-04'),event('b','2026-11-06')]),previous=report([event('c','2026-11-02'),event('d','2026-11-03')],previousQuery,{trendLabels:['A','missing']});
  const chart=buildTrendComparison(current,previous,currentQuery,previousQuery,'UTC','city','pv');
  expect(chart.times).toEqual(['2026-11-04','2026-11-05','2026-11-06']);expect(chart.series.map(series=>series.values)).toEqual([[1,0,1],[0,1,1]]);
  expect(previous.groups.city.find(row=>row.label==='missing')).toMatchObject({pv:0,uv:0,ips:0,sessions:0});
 });
 it('does not fill unknown IP, incomplete sessions or privacy-only metrics with zero',()=>{
  const unknown=report([event('a','2026-11-04','A',false)],currentQuery,{trendLabels:['A'],sessionContextComplete:false});
  expect(unknown.dimensionTrend.city.find(row=>row.time==='2026-11-05')).toMatchObject({pv:0,uv:0,ips:null,sessions:null});
  const key=publicIPKey(identity)!;
  const emptyNetwork=report([],previousQuery,{trendDimensions:['ip'],trendLabels:[key]});
  expect(emptyNetwork.groups.ip[0]).toMatchObject({ipKey:key,pv:0,uv:0,ips:0,sessions:0});
  const missing=report([event('a','2026-11-04','A',false)],currentQuery,{trendDimensions:['ip'],trendLabels:[key]});
  expect(missing.groups.ip).toEqual([]);expect(missing.dimensionTrend.ip).toEqual([]);
  const privacy=report([],currentQuery,{privacy:true,trendLabels:['A']});expect(privacy.groups.city[0]).toMatchObject({pv:0,uv:null,ips:null,newVisitors:null});
  const incompleteEntry=report([],currentQuery,{trendDimensions:['entry'],trendLabels:['/'],sessionContextComplete:false});expect(incompleteEntry.groups.entry).toEqual([]);expect(incompleteEntry.dimensionTrend.entry).toEqual([]);
  expect(buildTrendComparison(unknown,{...unknown,coverage:0},currentQuery,previousQuery,'UTC','city','pv').series).toHaveLength(1);
 });
 it('matches network series by stable key even when the display prefix differs',()=>{
  const current={coverage:1,dimensionTrend:{ip:[{time:'2026-11-04',label:'Current prefix',ipKey:'same',pv:3}]}},previous={coverage:1,dimensionTrend:{ip:[{time:'2026-11-01',label:'Previous prefix',ipKey:'same',pv:2}]}};
  expect(buildTrendComparison(current,previous,currentQuery,previousQuery,'UTC','ip','pv').series[1]?.values).toEqual([2,null,null]);
 });
 it('uses civil dates through the 25-hour DST day',()=>{
  const query=dateRange('2026-10-31','2026-11-02','America/New_York');expect(comparisonCalendar(query,'America/New_York')).toEqual(['2026-10-31','2026-11-01','2026-11-02']);
  const p=new URLSearchParams(query);expect((Date.parse(p.get('to')!)-Date.parse(p.get('from')!))/3600000).toBe(73);
 });
 it('validates a bounded selection and rejects conflicting selectors or invalid public IP keys',()=>{
  expect(trafficRangeSchema.parse({trendDimension:'city',trendLabels:'A'}).trendLabels).toEqual(['A']);
  expect(trafficRangeSchema.safeParse({trendDimension:'city',trendLabels:['A','B','C','D','E','F']}).success).toBe(false);
  expect(trafficRangeSchema.safeParse({trendDimension:'city',trendLabel:'A',trendLabels:['B']}).success).toBe(false);
  expect(trafficRangeSchema.safeParse({trendLabels:['A']}).success).toBe(false);
  expect(trafficRangeSchema.safeParse({trendDimension:'ip',trendLabels:['invalid']}).success).toBe(false);
 });
});
