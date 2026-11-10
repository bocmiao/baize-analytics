import {it, expect} from 'vitest';
import {normalizeRegion, summarizeGeography} from '../../src/server/geography-analytics.js';
import type {AnalyticsEvent} from '../../src/server/analytics.js';
import {networkIPIdentity} from '../../src/server/network-ip.js';
function event(visitor: string, country: string, region: string, city: string): AnalyticsEvent {return {site_id: 's', event_id: crypto.randomUUID(), visitor_id: visitor, page_id: crypto.randomUUID(), type: 'pageview', path: '/', ts: new Date(), payload: {}, dimensions: {country, region, city}};}
it('unions exact visitor sets when one visitor appears in multiple cities and normalizes only known provinces', () => {
 const result = summarizeGeography([event('a', 'CN', 'Sichuan', '成都'), event('a', 'CN', '四川省', '绵阳'), event('b', 'CN', '四川', '成都'), event('x', 'unknown', 'unknown', 'unknown')], {country: 'CN', region: '四川'});
 expect(result.countries.find(row => row.country === 'CN')).toMatchObject({pv: 3, uv: 2}); expect(result.regions).toEqual([expect.objectContaining({country: 'CN', region: '四川', pv: 3, uv: 2})]); expect(result.cities).toHaveLength(2); expect(result.geographyCoverage).toBe(.75); expect(normalizeRegion('US', 'Sichuan')).toBe('Sichuan'); expect(normalizeRegion('CN', '__proto__')).toBe('__proto__');
});
it('unions full IP identities across cities, deduplicates retries and keeps ISP scopes separate',()=>{
 const a=event('a','CN','Henan','洛阳'),b=event('b','CN','河南省','郑州'),c=event('c','CN','河南','洛阳');a.dimensions.client_ip_id=networkIPIdentity('192.0.2.1','s','secret')!;b.dimensions.client_ip_id=a.dimensions.client_ip_id;c.dimensions.client_ip_id=networkIPIdentity('192.0.2.2','s','secret')!;a.dimensions.isp=b.dimensions.isp='中国联通';c.dimensions.isp='中国移动';
 const result=summarizeGeography([a,a,b,c],{country:'CN',region:'河南'});expect(result.countries[0]).toMatchObject({pv:3,uv:3,ips:2,ipCoverage:1});expect(result.regions[0]).toMatchObject({region:'河南',ips:2});expect(result.cities.reduce((sum,row)=>sum+row.ips!,0)).toBe(3);expect(result.isps).toHaveLength(2);expect(JSON.stringify(result)).not.toContain(a.dimensions.client_ip_id);
 const selected=summarizeGeography([a,b,c],{country:'CN',region:'河南',city:'洛阳市',isp:'中国联通'});expect(selected.selected.totals).toMatchObject({pv:1,ips:1});expect(selected.isps).toHaveLength(2);expect(selected.cities).toHaveLength(2);
});
it('fills selected local-date trend gaps, leaving historical missing IPs unknown',()=>{
 const a=event('a','CN','Henan','洛阳'),b=event('b','CN','河南','郑州');a.ts='2026-11-01T17:00:00Z';b.ts='2026-11-02T17:00:00Z';a.dimensions.client_ip_id=networkIPIdentity('192.0.2.1','s','secret')!;
 const result=summarizeGeography([a,b],{country:'CN'},true,{timezone:'Asia/Shanghai',from:'2026-10-31T16:00:00Z',to:'2026-11-03T16:00:00Z'});expect(result.trend.map(row=>[row.time,row.pv,row.ips])).toEqual([['2026-11-01',0,0],['2026-11-02',1,1],['2026-11-03',1,null]]);expect(result.selected.totals).toMatchObject({ips:null,knownIps:1,ipCoverage:.5});
});
it('supports daily UV trend but hides network identity in daily-salt mode, including a single-day range',()=>{
 const a=event('a','CN','Henan','洛阳');a.dimensions.client_ip_id=networkIPIdentity('192.0.2.1','s','secret')!;const across=summarizeGeography([a],{},false,{privacy:true});expect(across.selected.totals).toMatchObject({uv:null,ips:null,ipStatus:'unsupported_in_this_mode'});expect(across.trend[0]).toMatchObject({uv:1,ips:null});const single=summarizeGeography([a],{},true,{privacy:true});expect(single.selected.totals).toMatchObject({uv:1,ips:null});
});
it('never invents locations for unknown and does not claim cross-day daily-salt UV', () => {
 const result = summarizeGeography([event('a', 'unknown', 'unknown', 'unknown')], {}, false); expect(result.geographyCoverage).toBe(0); expect(result.regions[0]).toMatchObject({region: 'unknown', uv: null}); expect(result.uvStatus).toBe('unsupported_in_this_mode');
});
