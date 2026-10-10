import {it, expect} from 'vitest';
import {normalizeRegion, summarizeGeography} from '../../src/server/geography-analytics.js';
import type {AnalyticsEvent} from '../../src/server/analytics.js';
function event(visitor: string, country: string, region: string, city: string): AnalyticsEvent {return {site_id: 's', event_id: crypto.randomUUID(), visitor_id: visitor, page_id: crypto.randomUUID(), type: 'pageview', path: '/', ts: new Date(), payload: {}, dimensions: {country, region, city}};}
it('unions exact visitor sets when one visitor appears in multiple cities and normalizes only known provinces', () => {
 const result = summarizeGeography([event('a', 'CN', 'Sichuan', '成都'), event('a', 'CN', '四川省', '绵阳'), event('b', 'CN', '四川', '成都'), event('x', 'unknown', 'unknown', 'unknown')], {country: 'CN', region: '四川'});
 expect(result.countries.find(row => row.country === 'CN')).toMatchObject({pv: 3, uv: 2}); expect(result.regions).toEqual([{country: 'CN', region: '四川', pv: 3, uv: 2}]); expect(result.cities).toHaveLength(2); expect(result.geographyCoverage).toBe(.75); expect(normalizeRegion('US', 'Sichuan')).toBe('Sichuan'); expect(normalizeRegion('CN', '__proto__')).toBe('__proto__');
});
it('never invents locations for unknown and does not claim cross-day daily-salt UV', () => {
 const result = summarizeGeography([event('a', 'unknown', 'unknown', 'unknown')], {}, false); expect(result.geographyCoverage).toBe(0); expect(result.regions[0]).toMatchObject({region: 'unknown', uv: null}); expect(result.uvStatus).toBe('unsupported_in_this_mode');
});
