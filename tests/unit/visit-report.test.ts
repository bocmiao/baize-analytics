import {describe,it,expect} from 'vitest';
import {buildTrafficReport,filterVisits,type TrafficModelOptions} from '../../src/server/51la-report-model.js';
import {sortVisitRows,visitReportCsv,MAX_VISIT_EXPORT_ROWS} from '../../src/server/visit-report.js';
import {visitsSchema} from '../../src/server/51la-reports.js';
import {visitReportQuery,visitorHistoryQuery} from '../../src/web/visitReportModel.js';
import type {AnalyticsEvent} from '../../src/server/analytics-core.js';
import type {DirectoryRule} from '../../src/server/site-content-management.js';
const options:TrafficModelOptions={from:'2026-11-01T00:00:00Z',to:'2026-11-02T00:00:00Z',timezone:'UTC',privacy:false,timeoutMs:1800000,firstSeen:new Map([['visitor-a','2026-10-01'],['visitor-b','2026-11-01']])};
const event=(id:string,visitor:string,time:string,path:string,dimensions:Record<string,string>={}):AnalyticsEvent=>({site_id:'s',event_id:id,visitor_id:visitor,page_id:id,type:'pageview',ts:'2026-11-01T'+time+'Z',path,payload:{},dimensions:{country:'CN',region:'Henan',city:'洛阳',channel:'search',referrer:'google.com',ip_truncated:'192.0.2.0',browser:'Firefox',...dimensions}});
const fixture=()=>[event('a1','visitor-a','01:00:00','/landing'),event('a2','visitor-a','01:02:00','/docs/start'),event('a3','visitor-a','02:00:00','/return'),event('b1','visitor-b','03:00:00','/other',{region:'Sichuan',city:'成都',browser:'Chrome'})];
describe('complete visit reports',()=>{
 it('searches masked IP and visitor prefixes across all sessions, plus country/province',()=>{
  const rows=buildTrafficReport(fixture(),options).visits;
  expect(filterVisits(rows,{visitorKey:'VISITOR-A',ipLabel:'192.0.2',country:'cn',region:'Henan'})).toHaveLength(2);
  expect(filterVisits(rows,{visitorKey:'a'})).toHaveLength(0);
  expect(filterVisits(rows,{region:'Sichuan'}).map(row=>row.visitorKey)).toEqual(['visitor-b']);
 });
 it('drills pages visited after entry, retaining full in-range paths and all matching visitor sessions',()=>{
  const report=buildTrafficReport(fixture(),{...options,visitDimension:'page',visitLabel:'/docs/start'});
  expect(report.visits).toHaveLength(1);expect(report.visits[0]?.paths.map(row=>row.path)).toEqual(['/landing','/docs/start']);
  expect(buildTrafficReport(fixture(),{...options,visitDimension:'entry',visitLabel:'/docs/start'}).visits).toEqual([]);
  expect(filterVisits(buildTrafficReport(fixture(),options).visits,{visitorKey:'visitor-a'})).toHaveLength(2);
 });
 it('clips complete path at the end and excludes a session that began before the selection',()=>{
  const rows=buildTrafficReport(fixture(),{...options,from:'2026-11-01T01:01:00Z',to:'2026-11-01T02:01:00Z'}).visits;
  expect(rows.map(row=>row.entry)).toEqual(['/return']);expect(rows[0]?.paths).toHaveLength(1);
 });
 it('sorts numbers globally, preserving deterministic ties and nulls last',()=>{
  const rows=buildTrafficReport(fixture(),options).visits;
  expect(sortVisitRows(rows,'duration','desc').map(row=>row.entry)).toEqual(['/landing','/return','/other']);
  expect(sortVisitRows(rows,'time','asc').map(row=>row.entry)).toEqual(['/landing','/return','/other']);
  const unknown={...rows[0]!,id:'unknown',city:null};expect(sortVisitRows([...rows,unknown],'city','desc').at(-1)?.id).toBe('unknown');
 });
 it('exports every supplied row, quoted paths and safe cells, with explicit hard caps',()=>{
  const rows=buildTrafficReport(fixture(),options).visits,row={...rows[0]!,visitorKey:' =HYPERLINK("evil")',keyword:'+cmd',city:'a,"b"',entry:'\tformula'};
  const csv=visitReportCsv([row,...rows],'Asia/Shanghai');expect(csv).toContain('访问时间（Asia/Shanghai）');expect(csv).toContain('"\' =HYPERLINK(""evil"")"');expect(csv).toContain('"\'+cmd"');expect(csv).toContain('"a,""b"""');expect(csv).toContain('"\'\tformula"');expect(csv).toContain('/docs/start');expect(csv).not.toContain('client_ip_id');
  expect(()=>visitReportCsv(Array(MAX_VISIT_EXPORT_ROWS+1).fill(row),'UTC')).toThrow('超过');
  expect(()=>visitReportCsv([{...row,keyword:'x'.repeat(8*1024*1024)}],'UTC')).toThrow('8 MB');
 });
 it('validates paired drill selectors and exposes bounded sorting only',()=>{
  expect(visitsSchema.safeParse({visitDimension:'directory'}).success).toBe(false);expect(visitsSchema.safeParse({visitDimension:'ip',visitLabel:'raw-network-token'}).success).toBe(false);
  expect(visitsSchema.safeParse({sort:'raw_token'}).success).toBe(false);expect(visitsSchema.parse({country:'CN',region:'Henan',sort:'pageviews',direction:'asc'})).toMatchObject({page:1,pageSize:25,country:'CN',region:'Henan',sort:'pageviews'});
 });
 it('keeps scope and drill on page changes but deliberately broadens visitor history to the selected dates',()=>{
  const scope='from=2026-11-01T00%3A00%3A00Z&to=2026-11-02T00%3A00%3A00Z&channel=search';
  const query=new URLSearchParams(visitReportQuery(scope,{page:2,size:20,sort:'duration',direction:'asc',dimension:'page',label:'/docs/start',filters:{country:' CN '}}));
  expect(Object.fromEntries(query)).toMatchObject({channel:'search',page:'2',pageSize:'20',sort:'duration',direction:'asc',visitDimension:'page',visitLabel:'/docs/start',country:'CN'});
  expect([...new URLSearchParams(visitorHistoryQuery(query.toString())).keys()]).toEqual(['from','to']);
 });
 it('counts overlapping configured directories independently in groups, trends and visit drill',()=>{
  const directoryRules:DirectoryRule[]=[{id:'a',name:'全部文档',path:'/docs',match:'prefix',enabled:true,createdAt:options.from,updatedAt:options.from},{id:'b',name:'入门',path:'/docs/start',match:'exact',enabled:true,createdAt:options.from,updatedAt:options.from}];
  const events=[event('1','visitor-a','01:00:00','/docs/start'),event('2','visitor-a','01:01:00','/docs/other'),event('3','visitor-b','02:00:00','/docsmith')];
  const report=buildTrafficReport(events,{...options,directoryRules,trendDimensions:['directory'],visitDimension:'directory',visitLabel:'入门'});
  expect(report.groups.directory.find(row=>row.label==='全部文档')).toMatchObject({pv:2,uv:1,sessions:1});expect(report.groups.directory.find(row=>row.label==='入门')).toMatchObject({pv:1,uv:1,sessions:1});expect(report.groups.directory.find(row=>row.label==='未分组')).toMatchObject({pv:1});
  expect(report.dimensionTrend.directory?.find(row=>row.label==='入门')).toMatchObject({pv:1,sessions:1});expect(report.visits).toHaveLength(1);expect(report.visits[0]?.paths).toHaveLength(2);expect(report.totals.pv).toBe(3);
 });
});
