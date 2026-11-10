import {describe,expect,it} from 'vitest';
import {countIPAudience,countIPIdentities,networkIPIdentity,networkIPLabel,normalizeNetworkIP,publicIPKey,stripInternalIPDimensions} from '../../src/server/network-ip.js';
import {sanitizeDailyDimensions} from '../../src/server/daily-privacy-policy.js';
import {scrubExportJson} from '../../src/server/site-export.js';
import {buildTrafficReport,filterVisits,type TrafficModelOptions} from '../../src/server/51la-report-model.js';
import type {AnalyticsEvent} from '../../src/server/analytics-core.js';
const ip=(value:string)=>networkIPIdentity(value,'site-a','test-secret')!;
const event=(id:string,visitor:string,address:string,extra:Record<string,string>={},ts='2026-11-02T01:00:00Z'):AnalyticsEvent=>({site_id:'site-a',event_id:id,visitor_id:visitor,page_id:id,type:'pageview',ts,path:'/'+id,payload:{url:'https://example.test/'+id},dimensions:{client_ip_id:ip(address),ip_truncated:'192.0.2.0',country:'CN',region:'河南',city:'洛阳',isp:'中国联通',browser:'Firefox',brand:'Apple',colorDepth:'24',...extra}});
const options=(extra:Partial<TrafficModelOptions>={}):TrafficModelOptions=>({from:'2026-11-01T00:00:00Z',to:'2026-11-04T00:00:00Z',timezone:'UTC',privacy:false,timeoutMs:1800000,firstSeen:new Map([['a','2026-10-01'],['b','2026-11-02']]),...extra});

describe('network IP identities',()=>{
 it('uses merged bucket keys rather than summing hourly distincts and preserves coverage limits',()=>{
  const counts={[ip('192.0.2.1')]:4,[ip('192.0.2.2')]:1,[ip('192.0.2.3')]:1};expect(countIPAudience(6,counts)).toEqual({ips:3,knownIps:3,ipCoverage:1,ipStatus:'complete'});expect(countIPAudience(7,counts)).toMatchObject({ips:null,knownIps:3,ipCoverage:6/7,ipStatus:'partial_ip_identity'});expect(countIPAudience(6,counts,false,false)).toEqual({ips:null,knownIps:null,ipCoverage:0,ipStatus:'incomplete_data'});expect(countIPAudience(6,counts,true).ipStatus).toBe('unsupported_in_this_mode');expect(countIPAudience(5,counts).ips).toBeNull();expect(countIPAudience(0,{}).ips).toBe(0);
 });
 it('normalizes equivalent IPv4-mapped and IPv6 spellings before hashing',()=>{
  expect(normalizeNetworkIP('::ffff:192.0.2.9')).toBe('192.0.2.9');expect(ip('::ffff:c000:209')).toBe(ip('192.0.2.9'));
  expect(ip('2001:0db8:0:0:0:0:0:1')).toBe(ip('2001:db8::1'));expect(normalizeNetworkIP('fe80::1%eth0')).toBe('fe80::1');
 });
 it('rejects ambiguous shortened IPv4, leading zeros, proxy lists, ports and invalid addresses',()=>{
  for(const value of ['127.1','0127.0.0.1','127.0.0.1:8080','192.0.2.1, 192.0.2.2',' 192.0.2.1','999.2.3.4','invalid','[::1]',''])expect(normalizeNetworkIP(value),value).toBeNull();
 });
 it('separates sites and secrets and distinguishes different hosts inside one /24',()=>{
  expect(ip('192.0.2.1')).not.toBe(ip('192.0.2.2'));expect(ip('192.0.2.1')).not.toBe(networkIPIdentity('192.0.2.1','site-b','test-secret'));expect(ip('192.0.2.1')).not.toBe(networkIPIdentity('192.0.2.1','site-a','other-secret'));
 });
 it('counts full network identities independently from visitor and prefix counts',()=>{
  const rows=[event('1','a','192.0.2.1'),event('2','b','192.0.2.1'),event('3','a','192.0.2.2')];expect(countIPIdentities(rows)).toEqual({ips:2,knownIps:2,ipCoverage:1,ipStatus:'complete'});
 });
 it('does not invent zeros when historical events lack identity and ignores non-pageviews',()=>{
  const old=event('old','old','192.0.2.3');delete old.dimensions.client_ip_id;const heartbeat={...old,type:'heartbeat' as const};
  expect(countIPIdentities([event('1','a','192.0.2.1'),old,heartbeat])).toEqual({ips:null,knownIps:1,ipCoverage:.5,ipStatus:'partial_ip_identity'});expect(countIPIdentities([old]).ipStatus).toBe('not_collected');expect(countIPIdentities([])).toMatchObject({ips:0,ipCoverage:1});
 });
 it('strips stable IP identity during privacy-mode sanitation and suppresses counts',()=>{
  expect(sanitizeDailyDimensions({client_ip_id:ip('192.0.2.1'),ip_truncated:'192.0.2.0',browser:'Firefox'})).not.toHaveProperty('client_ip_id');expect(countIPIdentities([event('1','a','192.0.2.1')],true)).toEqual({ips:null,knownIps:null,ipCoverage:0,ipStatus:'unsupported_in_this_mode'});
 });
 it('renders a masked label with a stable public selector, never the raw identity',()=>{
  const d=event('1','a','192.0.2.1').dimensions,key=publicIPKey(d.client_ip_id)!;expect(key).toMatch(/^[a-f0-9]{24}$/);expect(networkIPLabel(d)).toBe(`192.0.2.0 · ${key.slice(0,12)}`);expect(key).not.toBe(d.client_ip_id!.slice(3,27));
 });
 it('sanitizes response copies and JSON-keyed exports without mutating facts',()=>{
  const token=ip('192.0.2.1'),facts={audience:{client_ip_id:{[token]:1},browser:{Firefox:1}},dimensionRows:[{dimensions:{client_ip_id:token,city:'洛阳'}}]},serialized=JSON.stringify(stripInternalIPDimensions(facts));expect(serialized).not.toContain(token);expect(serialized).not.toContain('client_ip_id');expect(facts.dimensionRows[0]!.dimensions.client_ip_id).toBe(token);
  const exported=scrubExportJson({...facts,segments:{[JSON.stringify({client_ip_id:token,path:'/a'})]:{pv:1}}},false);expect(JSON.stringify(exported)).not.toContain(token);
 });
});

describe('51LA exact network reports',()=>{
 it('deduplicates repeated events while preserving distinct IPs across days and subnets',()=>{
  const one=event('1','a','192.0.2.1'),two=event('2','b','192.0.2.2'),three=event('3','a','192.0.2.1',{},'2026-11-03T01:00:00Z');const report=buildTrafficReport([one,one,two,three],options());
  expect(report.totals).toMatchObject({pv:3,uv:2,ips:2,ipCoverage:1});expect(report.days.map(row=>row.ips)).toEqual([2,1]);expect(report.groups.ip).toHaveLength(2);expect(report.groups.ipPrefix[0]).toMatchObject({ips:2,uv:2});expect(report.groups.week[0]?.ips).toBe(2);expect(JSON.stringify(report)).not.toContain(one.dimensions.client_ip_id);
 });
 it('includes real ISP and location summaries with multiple-location indication',()=>{
  const report=buildTrafficReport([event('1','a','192.0.2.1'),event('2','b','192.0.2.1',{city:'郑州',isp:'中国移动'})],options());expect(report.groups.ip[0]).toMatchObject({country:'CN',region:'河南',city:'洛阳 / 郑州',isp:'中国移动 / 中国联通',multipleLocations:true,ips:1});expect(report.groups.isp).toHaveLength(2);expect(report.groups.region[0]).toMatchObject({label:'河南',pv:2});expect(report.groups.brand[0]?.label).toBe('Apple');expect(report.groups.colorDepth[0]?.label).toBe('24');
 });
 it('selects exact public IP filters and trends without returning the internal HMAC',()=>{
  const rows=[event('1','a','192.0.2.1'),event('2','b','192.0.2.2')],key=publicIPKey(rows[1]!.dimensions.client_ip_id)!;const report=buildTrafficReport(rows,options({trendDimensions:['ip'],trendLabel:key}));expect(filterVisits(report.visits,{ipKey:key})).toHaveLength(1);expect(filterVisits(report.visits,{isp:'not this provider'})).toHaveLength(0);expect(report.dimensionTrend.ip).toEqual([expect.objectContaining({ipKey:key,pv:1,ips:1})]);expect(JSON.stringify(report.dimensionTrend)).not.toContain(rows[1]!.dimensions.client_ip_id);
 });
 it('matches an IP first seen midway through a session and retains each page network label',()=>{
  const rows=[event('1','a','192.0.2.1'),event('2','a','192.0.2.2',{},'2026-11-02T01:01:00Z')],key=publicIPKey(rows[1]!.dimensions.client_ip_id)!;const report=buildTrafficReport(rows,options()),selected=filterVisits(report.visits,{ipKey:key});expect(selected).toHaveLength(1);expect(selected[0]).toMatchObject({pageviews:2,multipleIPs:true});expect(selected[0]!.ipKeys).toHaveLength(2);expect(selected[0]!.paths[1]!.ipKey).toBe(key);expect(selected[0]!.ipKey).not.toBe(key);
 });
 it('allows an explicit low-traffic dimension outside top five and bounds default trends',()=>{
  const rows=Array.from({length:10},(_,n)=>event(String(n),String(n),'192.0.2.'+(n+1),{city:'city'+n}));const report=buildTrafficReport(rows,options({trendDimensions:['city','isp','brand','colorDepth']}));expect(Object.keys(report.dimensionTrend)).toHaveLength(3);expect(report.dimensionTrend.city).toHaveLength(5);const specific=buildTrafficReport(rows,options({trendDimensions:['city'],trendLabel:'city9'}));expect(specific.dimensionTrend.city).toEqual([expect.objectContaining({label:'city9',pv:1})]);
 });
 it('adds pageview totals to session depth and duration distributions',()=>{
  const report=buildTrafficReport([event('1','a','192.0.2.1'),event('2','a','192.0.2.1',{},'2026-11-02T01:01:00Z'),event('3','b','192.0.2.2')],options());for(const buckets of [report.engagement.depth,report.engagement.duration]){expect(buckets.reduce((sum,row)=>sum+row.pv,0)).toBe(3);expect(buckets.reduce((sum,row)=>sum+row.sessions,0)).toBe(2);}
 });
 it('disables IP groups, labels and selectors under daily salt even for old stable input',()=>{
  const report=buildTrafficReport([event('1','a','192.0.2.1')],options({privacy:true,trendDimensions:['ip']}));expect(report.totals.ips).toBeNull();expect(report.groups.ip).toEqual([]);expect(report.visits[0]).toMatchObject({ipKey:null,ipLabel:null,ipPrefix:null});expect(JSON.stringify(report)).not.toContain(ip('192.0.2.1'));
 });
});
