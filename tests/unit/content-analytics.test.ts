import {expect, it} from 'vitest';
import {sessionize, type AnalyticsEvent} from '../../src/server/analytics.js';
import {repairCsv, summarizeContent, summarizeDefinitionFeatures} from '../../src/server/content-analytics.js';
function event(visitor: string, minute: number, path: string, extra: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
 return {site_id: 's', event_id: crypto.randomUUID(), ts: `2026-10-01T10:${String(minute).padStart(2, '0')}:00Z`, visitor_id: visitor, page_id: crypto.randomUUID(), type: 'pageview', path, payload: {}, dimensions: {channel: 'search', device: 'mobile'}, ...extra};
}
it('groups actual downloads by URL and extension, preserves 404 origins and safe prototype event trends', () => {
 const events = [event('a', 0, '/missing', {payload: {props: {status: 404}}, dimensions: {channel: 'search', referrer: 'https://search.test/q'}}), event('a', 1, '/docs', {type: 'event', payload: {event_name: 'download', props: {url: 'https://files.test/report.PDF?version=2'}}}), event('b', 2, '/docs', {type: 'event', payload: {event_name: 'download', props: {url: 'https://files.test/report.PDF?version=2'}}}), event('a', 3, '/docs', {type: 'event', payload: {event_name: '__proto__'}})];
 const result = summarizeContent(events); expect(result.downloads).toEqual([{url: 'https://files.test/report.PDF?version=2', fileType: 'pdf', path: '/docs', count: 2, uv: 2}]); expect(result.notFound[0]).toEqual({path: '/missing', channel: 'search', referrer: 'https://search.test/q', count: 1}); expect(result.eventTrend[0]!.events['__proto__' as string]).toEqual({count: 1, uv: 1}); expect(Object.getPrototypeOf(result.eventTrend[0]!.events)).toBeNull();
 expect(repairCsv([{path: '/404', channel: '=IMPORTXML()', referrer: 'line\n"quoted"', count: 2}])).toContain('"\'=IMPORTXML()"');
});
it('counts funnel loss from ordered sessions and goal channels at actual completion times', () => {
 const events = [event('lost', 0, '/a'), event('lost', 1, '/x'), event('won', 0, '/a', {dimensions: {channel: 'social', device: 'desktop'}}), event('won', 1, '/b', {dimensions: {channel: 'direct', device: 'desktop'}}), event('won', 2, '/b', {type: 'event', payload: {event_name: 'signup'}, dimensions: {channel: 'direct', device: 'desktop'}})];
 const result = summarizeDefinitionFeatures(sessionize(events), [{id: '__proto__', type: 'event', config: {event_name: 'signup'}}], [{id: 'flow', steps: [{type: 'page', value: '/a'}, {type: 'page', value: '/b'}], strict: false}], '2026-10-01T10:00:00Z', '2026-10-01T11:00:00Z');
 expect(result.dropoffFeatures.flow).toEqual([{step: 0, entered: 2, lost: 1, sources: [{value: 'search', count: 1}], devices: [{value: 'mobile', count: 1}], coverage: 1, sampleRate: 1, status: 'supported'}]); expect(result.goalTrends['__proto__' as string]![0]).toEqual({time: '2026-10-01T10:00:00.000Z', conversions: 1, channels: [{channel: 'social', conversions: 1}]});
});
