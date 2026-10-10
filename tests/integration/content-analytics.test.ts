import Fastify from 'fastify';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {beforeAll, afterAll, describe, expect, it} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {registerAnalytics} from '../../src/server/analytics.js';
import type {AppContext} from '../../src/server/context.js';
describe.skipIf(!process.env.TEST_DATABASE_URL)('real PostgreSQL content and funnel features', () => {
 const schema = `content_${randomUUID().replaceAll('-', '')}`;
 const admin = new Pool({connectionString: process.env.TEST_DATABASE_URL});
 const pool = new Pool({connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}`});
 const app = Fastify(); const site = randomUUID(), goal = randomUUID(), funnel = randomUUID();
 const start = Math.floor((Date.now() - 86400000) / 3600000) * 3600000;
 let calls = 0;
 beforeAll(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`); await migrate(pool);
  await pool.query("INSERT INTO sites(id,name,domain,salt_secret,timezone) VALUES($1,'content','example.test','test','UTC')", [site]);
  await pool.query('INSERT INTO aggregation_state(site_id) VALUES($1)', [site]);
  await pool.query("INSERT INTO goals(id,site_id,name,type,config) VALUES($1,$2,'Signup','event',$3)", [goal, site, {event_name: 'signup'}]);
  await pool.query("INSERT INTO funnels(id,site_id,name,steps,strict) VALUES($1,$2,'Buy',$3,false)", [funnel, site, JSON.stringify([{type: 'page', value: '/a'}, {type: 'page', value: '/b'}])]);
  const rows = [
   {v: 'lost', m: 0, path: '/a', type: 'pageview', payload: {}, channel: 'search', device: 'mobile'},
   {v: 'lost', m: 1, path: '/404', type: 'pageview', payload: {props: {status: 404}, referrer: 'https://source.test/old/link'}, channel: 'search', device: 'mobile'},
   {v: 'won', m: 0, path: '/a', type: 'pageview', payload: {}, channel: 'social', device: 'desktop'},
   {v: 'won', m: 1, path: '/b', type: 'pageview', payload: {}, channel: 'direct', device: 'desktop'},
   {v: 'won', m: 2, path: '/b', type: 'event', payload: {event_name: 'signup'}, channel: 'direct', device: 'desktop'},
   {v: 'won', m: 3, path: '/b', type: 'event', payload: {event_name: 'download', props: {url: 'https://files.test/a.pdf'}}, channel: 'direct', device: 'desktop'}
  ];
  for (const row of rows) await pool.query('INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [site, randomUUID(), new Date(start + row.m * 60000), row.v, randomUUID(), row.type, row.path, row.payload, {channel: row.channel, device: row.device, referrer: 'https://source.test/old', utm_campaign: row.channel === 'social' ? 'campaign-a' : 'campaign-b'}]);
  await registerAnalytics(app, {pool, audit: async () => {}, authorize: async () => {calls++; return {id: randomUUID()};}} as unknown as AppContext);
 });
 afterAll(async () => {await app.close(); await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();});
 const range = () => `from=${new Date(start).toISOString()}&to=${new Date(start + 3600000).toISOString()}`;
 it('reads exact raw downloads, 404 referring paths, goal channels and lost visitor dimensions through authorized HTTP', async () => {
  const reply = await app.inject(`/api/v1/sites/${site}/content?${range()}`); expect(reply.statusCode).toBe(200); const result = reply.json();
  expect(result.downloads).toEqual([{url: 'https://files.test/a.pdf', fileType: 'pdf', path: '/b', count: 1, uv: 1}]);
  expect(result.notFound).toEqual([{path: '/404', channel: 'search', referrer: 'https://source.test/old/link', count: 1}]);
  expect(result.eventTrend[0].events.signup.count).toBe(1);
  expect(result.goalTrends[goal][0].channels).toEqual([{channel: 'social', conversions: 1}]);
  expect(result.dropoffFeatures[funnel][0]).toMatchObject({entered: 2, lost: 1, sources: [{value: 'search', count: 1}], devices: [{value: 'mobile', count: 1}], sampleRate: 1});
  const csv = await app.inject(`/api/v1/sites/${site}/content/404.csv?${range()}`); expect(csv.statusCode).toBe(200); expect(csv.body).toContain('"/404","search","https://source.test/old/link","1",""'); expect(calls).toBe(2);
  const filtered = (await app.inject(`/api/v1/sites/${site}/analysis/features?${range()}&utm_campaign=campaign-a`)).json();
  expect(filtered.goalTrends[goal][0].conversions).toBe(1); expect(filtered.dropoffFeatures[funnel][0]).toMatchObject({entered: 1, lost: 0});
  expect(filtered.notFound).toEqual([]); expect(filtered.downloads).toEqual([]);
  const stats = (await app.inject(`/api/v1/sites/${site}/stats?${range()}&utm_campaign=campaign-a`)).json(); expect(stats.totals.pv).toBe(1); expect(stats.totals.sessions).toBe(1); expect(stats.dimensionRows.every((row: {dimensions: {utm_campaign: string}}) => row.dimensions.utm_campaign === 'campaign-a')).toBe(true);
  const analysis = (await app.inject(`/api/v1/sites/${site}/analysis?${range()}&utm_campaign=campaign-a`)).json(); expect(analysis.funnels[0].steps).toEqual([1, 1]);
 });
 it('returns actual province/city drilldowns with exact UV and explicit unknown coverage', async () => {
  await pool.query("UPDATE events SET dimensions=dimensions || '{\"country\":\"CN\",\"region\":\"Sichuan\",\"city\":\"成都\"}'::jsonb WHERE site_id=$1 AND visitor_id='won'", [site]);
  const result = (await app.inject(`/api/v1/sites/${site}/geography?${range()}&country=CN&region=四川`)).json();
  expect(result.regions).toEqual([{country: 'CN', region: '四川', pv: 2, uv: 1}]); expect(result.cities).toEqual([{country: 'CN', region: '四川', city: '成都', pv: 2, uv: 1}]); expect(result.geographyCoverage).toBe(.5);
 });
 it('rejects expired repair evidence instead of exporting partial samples and rejects daily-salt cross-day retention claims', async () => {
  const old = `from=${new Date(Date.now() - 800 * 86400000).toISOString()}&to=${new Date(Date.now() - 799 * 86400000).toISOString()}`;
  expect((await app.inject(`/api/v1/sites/${site}/content?${old}`)).json()).toMatchObject({status: 'outside_raw_retention', coverage: 0, notFound: []});
  expect((await app.inject(`/api/v1/sites/${site}/content/404.csv?${old}`)).statusCode).toBe(409);
  await pool.query("UPDATE sites SET privacy_mode='daily_salt' WHERE id=$1", [site]);
  const response = await app.inject(`/api/v1/sites/${site}/analysis/features?from=${new Date(start).toISOString()}&to=${new Date(start + 2 * 86400000).toISOString()}`);
  expect(response.json()).toMatchObject({funnelStatus: 'unsupported_in_this_mode', dropoffFeatures: {}});
 });
});
