export {contentFilterSchema,eventMatchesFilters,type ContentFilters} from './analytics-core.js';
import {contentFilterSchema,eventMatchesFilters,type ContentFilters} from './analytics-core.js';
import type { AnalyticsEvent, FunnelDefinition, GoalDefinition, Session } from './analytics.js';
import { dictionary, funnelVisitors, goalCompletion, goalMatches, lastClick } from './analytics.js';

function props(event: AnalyticsEvent): Record<string, unknown> {
 return event.payload.props && typeof event.payload.props === 'object' ? event.payload.props as Record<string, unknown> : dictionary();
}
function hour(event: AnalyticsEvent): string { return new Date(Math.floor(+new Date(event.ts) / 3600000) * 3600000).toISOString(); }
function fileType(url: string): string {
 try { const path = new URL(url, 'https://self.invalid').pathname; return /\.([a-z0-9]{1,16})$/i.exec(path)?.[1]?.toLowerCase() || 'unknown'; } catch { return 'unknown'; }
}
export function summarizeContent(events: AnalyticsEvent[]) {
 const downloads = new Map<string, {url: string; fileType: string; path: string; count: number; visitors: Set<string>}>();
 const notFound = new Map<string, {path: string; channel: string; referrer: string; count: number}>();
 const trends = new Map<string, Map<string, {count: number; visitors: Set<string>}>>();
 for (const event of events) {
  const p = props(event);
  if (event.type === 'pageview' && Number(p.status) === 404) {
   const item = {path: event.path, channel: event.dimensions.channel || 'unknown', referrer: typeof event.payload.referrer === 'string' ? event.payload.referrer : event.dimensions.referrer || '', count: 0};
   const key = JSON.stringify([item.path, item.channel, item.referrer]);
   const row = notFound.get(key) || item; row.count++; notFound.set(key, row);
  }
  if (event.type !== 'event' && event.type !== 'revenue') continue;
  const name = String(event.payload.event_name || event.type);
  const time = hour(event); const names = trends.get(time) || new Map<string, {count: number; visitors: Set<string>}>();
  const trend = names.get(name) || {count: 0, visitors: new Set<string>()}; trend.count++; trend.visitors.add(event.visitor_id); names.set(name, trend); trends.set(time, names);
  if (name === 'download' && typeof p.url === 'string') {
   const item = {url: p.url, fileType: fileType(p.url), path: event.path, count: 0, visitors: new Set<string>()};
   const key = JSON.stringify([item.url, item.fileType, item.path]); const row = downloads.get(key) || item;
   row.count++; row.visitors.add(event.visitor_id); downloads.set(key, row);
  }
 }
 return {
  downloads: [...downloads.values()].map(({visitors, ...row}) => ({...row, uv: visitors.size})).sort((a, b) => b.count - a.count || a.url.localeCompare(b.url)),
  notFound: [...notFound.values()].sort((a, b) => b.count - a.count || a.path.localeCompare(b.path)),
  eventTrend: [...trends].sort(([a], [b]) => a.localeCompare(b)).map(([time, names]) => {
   const events = dictionary<{count: number; uv: number}>(); for (const [name, row] of names) events[name] = {count: row.count, uv: row.visitors.size}; return {time, events};
  })
 };
}
export function repairCsv(rows: {path: string; channel: string; referrer: string; count: number}[]): string {
 const quote = (input: string | number) => { let value = String(input); if (/^[=+\-@\t\r\n]/.test(value)) value = `'${value}`; return `"${value.replaceAll('"', '""')}"`; };
 return '\uFEFF' + [['失效路径', '来源渠道', '来源页面', '次数', '修复目标'], ...rows.map(row => [row.path, row.channel, row.referrer, row.count, ''])].map(row => row.map(quote).join(',')).join('\r\n');
}
/** Census over actual event-time sessions, never sampled events masquerading as loss counts. */
export function summarizeDefinitionFeatures(sessions: Session[], goals: GoalDefinition[], funnels: FunnelDefinition[], from: string, to: string) {
 const selected = (event: AnalyticsEvent) => +new Date(event.ts) >= +new Date(from) && +new Date(event.ts) < +new Date(to);
 const goalTrends = dictionary<{time: string; conversions: number; channels: {channel: string; conversions: number}[]}[]>();
 for (const goal of goals) {
  const hours = new Map<string, Map<string, number>>();
  for (const session of sessions) {
   if (!goalMatches(session, goal)) continue; const completion = goalCompletion(session, goal); if (!selected(completion)) continue;
   const time = hour(completion), channel = lastClick(session, completion).channel; const channels = hours.get(time) || new Map<string, number>(); channels.set(channel, (channels.get(channel) || 0) + 1); hours.set(time, channels);
  }
  goalTrends[goal.id] = [...hours].sort(([a], [b]) => a.localeCompare(b)).map(([time, channels]) => ({time, conversions: [...channels.values()].reduce((a, b) => a + b, 0), channels: [...channels].map(([channel, conversions]) => ({channel, conversions}))}));
 }
 const dropoffFeatures = dictionary<{step: number; entered: number; lost: number; sources: {value: string; count: number}[]; devices: {value: string; count: number}[]; coverage: number; sampleRate: number; status: string}[]>();
 for (const funnel of funnels) {
  const cohort = [...sessions].sort((a, b) => a.started_at.localeCompare(b.started_at) || a.id.localeCompare(b.id)).filter(session => {const first = session.events.find(event => event.type === 'pageview'); return first && selected(first);});
  const steps = funnelVisitors(cohort, funnel.steps, funnel.strict);
  const features = new Map<string, {channel: string; device: string}>();
  for (const session of cohort) {
   const entered = funnelVisitors([session], funnel.steps, funnel.strict)[0]; if (!entered?.length) continue;
   const first = session.events.find(event => funnel.steps[0]!.type === 'page' ? event.type === 'pageview' && event.path === funnel.steps[0]!.value : event.type === 'event' && event.payload.event_name === funnel.steps[0]!.value)!;
   // Deterministic earliest session attribution for visitors entering more than once.
   if (!features.has(session.visitor_id)) features.set(session.visitor_id, {channel: lastClick(session, first).channel, device: first.dimensions.device || session.dimensions.device || 'unknown'});
  }
  dropoffFeatures[funnel.id] = steps.slice(0, -1).map((visitors, step) => {
   const next = new Set(steps[step + 1]); const lost = visitors.filter(visitor => !next.has(visitor)); const sources = new Map<string, number>(), devices = new Map<string, number>();
   for (const visitor of lost) {const feature = features.get(visitor)!; sources.set(feature.channel, (sources.get(feature.channel) || 0) + 1); devices.set(feature.device, (devices.get(feature.device) || 0) + 1);}
   const rows = (map: Map<string, number>) => [...map].map(([value, count]) => ({value, count})).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
   return {step, entered: visitors.length, lost: lost.length, sources: rows(sources), devices: rows(devices), coverage: 1, sampleRate: 1, status: 'supported'};
  });
 }
 return {goalTrends, dropoffFeatures};
}

import {readSiteEvents} from './event-store.js';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from './context.js';
import { z } from 'zod';
import { dayOf, sessionize, sessionTimeoutMs } from './analytics.js';
const contentRange = contentFilterSchema.extend({from: z.iso.datetime(), to: z.iso.datetime()});
export async function queryContentFeatures(ctx: AppContext, siteId: string, from: string, to: string, filters: ContentFilters = {}) {
 if (+new Date(to) <= +new Date(from) || +new Date(to) - +new Date(from) > 90 * 86400000) throw Object.assign(new Error('内容与行为明细查询限制为90天'), {statusCode: 400});
 const site = (await ctx.pool.query('SELECT timezone,privacy_mode,retention_days,config FROM sites WHERE id=$1', [siteId])).rows[0];
 if (!site) throw Object.assign(new Error('站点不存在'), {statusCode: 404});
 const cutoff = new Date(Date.now() - Number(site.retention_days) * 86400000);
 const state = (await ctx.pool.query('SELECT generation,processed_generation,watermark FROM aggregation_state WHERE site_id=$1', [siteId])).rows[0];
 // An expired raw interval cannot be reconstructed from legacy marginal aggregates.
 if (+new Date(from) < +cutoff) return {from, to, watermark: state?.watermark ?? null, coverage: 0, sampleRate: 1, status: 'outside_raw_retention', downloads: [], notFound: [], eventTrend: [], goalTrends: dictionary(), dropoffFeatures: dictionary(), limitations: ['该查询需要完整明细，所选区间部分超出明细保留期，未以残缺样本推断结果。']};
 const {events, ...storage} = await readSiteEvents(ctx.pool, siteId, {from: cutoff});
 const selected = events.filter(event => +new Date(event.ts) >= +new Date(from) && +new Date(event.ts) < +new Date(to) && eventMatchesFilters(event, filters));
 const goals = (await ctx.pool.query('SELECT * FROM goals WHERE site_id=$1', [siteId])).rows as GoalDefinition[];
 const funnels = (await ctx.pool.query('SELECT * FROM funnels WHERE site_id=$1', [siteId])).rows as FunnelDefinition[];
 const privacy = site.privacy_mode !== 'standard';
 const crossDay = dayOf(from, site.timezone) !== dayOf(new Date(+new Date(to) - 1), site.timezone);
 const content = summarizeContent(selected);
 const sessions = sessionize(events, site.timezone, privacy, sessionTimeoutMs(site.config));
 const cohort = sessions.filter(session => {const landing = session.events.find(event => event.type === 'pageview'); return landing && eventMatchesFilters(landing, filters);});
 const definitions = summarizeDefinitionFeatures(cohort, goals, funnels, from, to);
 return {from, to, storage, filters, filterMethod: 'retained_event_rebuild', watermark: state?.watermark ?? null, coverage: 1, sampleRate: 1, status: 'supported', ...content, ...definitions, ...(privacy && crossDay ? {downloads: content.downloads.map(row => ({...row, uv: null})), dropoffFeatures: dictionary(), funnelStatus: 'unsupported_in_this_mode'} : {funnelStatus: 'supported'}), limitations: ['下载、404和行为特征从保留期内真实非机器人事件计算；漏斗入组按会话首个页面浏览的事件时间，后续步骤读取完整保留会话。', '每名访客重复入组时，流失维度归属首次入组会话的来源和设备；不推断未收到或保留期外事件。']};
}
export async function registerContentAnalytics(app: FastifyInstance, ctx: AppContext) {
 app.get('/api/v1/sites/:siteId/content', async req => {const {siteId} = req.params as {siteId: string}; await ctx.authorize(req, siteId); const q = contentRange.parse(req.query); return queryContentFeatures(ctx, siteId, q.from, q.to, contentFilterSchema.parse(q));});
 app.get('/api/v1/sites/:siteId/content/404.csv', async (req, reply) => {const {siteId} = req.params as {siteId: string}; const user = await ctx.authorize(req, siteId); const q = contentRange.parse(req.query); const result = await queryContentFeatures(ctx, siteId, q.from, q.to, contentFilterSchema.parse(q)); if (result.status !== 'supported') throw Object.assign(new Error('所选期间没有完整保留的404来源明细，无法导出修链清单'), {statusCode: 409}); await ctx.audit(user.id, siteId, '404.repair_export', {from: q.from, to: q.to, rows: result.notFound.length}); reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="404-repair.csv"'); return repairCsv(result.notFound);});
 app.get('/api/v1/sites/:siteId/analysis/features', async req => {const {siteId} = req.params as {siteId: string}; await ctx.authorize(req, siteId); const q = contentRange.parse(req.query); return queryContentFeatures(ctx, siteId, q.from, q.to, contentFilterSchema.parse(q));});
}
