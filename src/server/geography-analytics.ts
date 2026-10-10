import {readSiteEvents} from './event-store.js';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {AppContext} from './context.js';
import {dayOf, type AnalyticsEvent} from './analytics.js';
import {contentFilterSchema, eventMatchesFilters} from './content-analytics.js';
// GeoIP may use translated or English subdivision names; normalize only known aliases.
const provinces: [string, string[]][] = [
 ['北京',['Beijing','北京市']],['天津',['Tianjin','天津市']],['河北',['Hebei','河北省']],['山西',['Shanxi','山西省']],['内蒙古',['Inner Mongolia','内蒙古自治区']],['辽宁',['Liaoning','辽宁省']],['吉林',['Jilin','吉林省']],['黑龙江',['Heilongjiang','黑龙江省']],['上海',['Shanghai','上海市']],['江苏',['Jiangsu','江苏省']],['浙江',['Zhejiang','浙江省']],['安徽',['Anhui','安徽省']],['福建',['Fujian','福建省']],['江西',['Jiangxi','江西省']],['山东',['Shandong','山东省']],['河南',['Henan','河南省']],['湖北',['Hubei','湖北省']],['湖南',['Hunan','湖南省']],['广东',['Guangdong','广东省']],['广西',['Guangxi','广西壮族自治区']],['海南',['Hainan','海南省']],['重庆',['Chongqing','重庆市']],['四川',['Sichuan','四川省']],['贵州',['Guizhou','贵州省']],['云南',['Yunnan','云南省']],['西藏',['Tibet','Tibet Autonomous Region','西藏自治区']],['陕西',['Shaanxi','陕西省']],['甘肃',['Gansu','甘肃省']],['青海',['Qinghai','青海省']],['宁夏',['Ningxia','宁夏回族自治区']],['新疆',['Xinjiang','新疆维吾尔自治区']],['香港',['Hong Kong','香港特别行政区']],['澳门',['Macao','Macau','澳门特别行政区']],['台湾',['Taiwan','台湾省']]
];
const aliases = new Map(provinces.flatMap(([province, names]) => [province, ...names].map(name => [name.toLowerCase(), province] as const)));
export function normalizeRegion(country: string, value: string): string {return country === 'CN' || country === 'HK' || country === 'MO' || country === 'TW' ? aliases.get(value.trim().toLowerCase()) || value || 'unknown' : value || 'unknown';}
export function summarizeGeography(events: AnalyticsEvent[], dimensions: {country?: string; region?: string} = {}, uvSupported = true) {
 const countries = new Map<string, {pv: number; visitors: Set<string>}>();
 const regions = new Map<string, {country: string; region: string; pv: number; visitors: Set<string>}>();
 const cities = new Map<string, {country: string; region: string; city: string; pv: number; visitors: Set<string>}>();
 let known = 0, total = 0;
 for (const event of events) {
  if (event.type !== 'pageview') continue;
  const country = event.dimensions.country || 'unknown'; const region = normalizeRegion(country, event.dimensions.region || 'unknown'); const city = event.dimensions.city || 'unknown';
  total++; if (country !== 'unknown' && region !== 'unknown') known++;
  const c = countries.get(country) || {pv: 0, visitors: new Set<string>()}; c.pv++; c.visitors.add(event.visitor_id); countries.set(country, c);
  if (dimensions.country && dimensions.country !== country) continue;
  const regionKey = JSON.stringify([country, region]); const r = regions.get(regionKey) || {country, region, pv: 0, visitors: new Set<string>()}; r.pv++; r.visitors.add(event.visitor_id); regions.set(regionKey, r);
  if (dimensions.region && normalizeRegion(country, dimensions.region) !== region) continue;
  const cityKey = JSON.stringify([country, region, city]); const ci = cities.get(cityKey) || {country, region, city, pv: 0, visitors: new Set<string>()}; ci.pv++; ci.visitors.add(event.visitor_id); cities.set(cityKey, ci);
 }
 const rows = <T extends {pv: number; visitors: Set<string>}>(input: T[]) => input.map(({visitors, ...row}) => ({...row, uv: uvSupported ? visitors.size : null})).sort((a, b) => b.pv - a.pv);
 return {countries: rows([...countries].map(([country, data]) => ({country, ...data}))), regions: rows([...regions.values()]), cities: rows([...cities.values()]), geographyCoverage: total ? known / total : 0, pv: total, uvStatus: uvSupported ? 'supported' : 'unsupported_in_this_mode', distinctMethod: 'exact_set'};
}
export async function registerGeographyAnalytics(app: FastifyInstance, ctx: AppContext) {
 app.get('/api/v1/sites/:siteId/geography', async req => {
  const {siteId} = req.params as {siteId: string}; await ctx.authorize(req, siteId);
  const query = contentFilterSchema.extend({from: z.iso.datetime(), to: z.iso.datetime(), country: z.string().max(64).optional(), region: z.string().max(128).optional()}).parse(req.query);
  if (+new Date(query.to) <= +new Date(query.from) || +new Date(query.to) - +new Date(query.from) > 90 * 86400000) throw Object.assign(new Error('地域明细查询限制为90天'), {statusCode: 400});
  const site = (await ctx.pool.query('SELECT retention_days,privacy_mode,timezone FROM sites WHERE id=$1', [siteId])).rows[0]; if (!site) throw Object.assign(new Error('站点不存在'), {statusCode: 404});
  const cutoff = new Date(Date.now() - Number(site.retention_days) * 86400000);
  if (+new Date(query.from) < +cutoff) return {status: 'outside_raw_retention', coverage: 0, countries: [], regions: [], cities: [], geographyCoverage: 0};
  const {events: data, ...storage} = await readSiteEvents(ctx.pool, siteId, {from: query.from, to: query.to, type: 'pageview'});
  const uvSupported = site.privacy_mode === 'standard' || dayOf(query.from, site.timezone) === dayOf(new Date(+new Date(query.to) - 1), site.timezone);
  const filters = contentFilterSchema.parse(query); return {from: query.from, to: query.to, storage, filters, filterMethod: 'retained_event_rebuild', status: 'supported', coverage: 1, ...summarizeGeography(data.filter(event => eventMatchesFilters(event, filters)), query, uvSupported)};
 });
}
