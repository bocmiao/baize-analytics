import {readSiteEvents} from './event-store.js';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {AppContext} from './context.js';
import {dayOf, type AnalyticsEvent} from './analytics-core.js';
import {contentFilterSchema, eventMatchesFilters} from './content-analytics.js';
import {countIPIdentities} from './network-ip.js';
import {withStatsReadSnapshot} from './stats-read-snapshot.js';
import {ApplicationError} from '../shared/error-codes.js';
// GeoIP may use translated or English subdivision names; normalize only known aliases.
const provinces: [string, string[]][] = [
 ['北京',['Beijing','北京市']],['天津',['Tianjin','天津市']],['河北',['Hebei','河北省']],['山西',['Shanxi','山西省']],['内蒙古',['Inner Mongolia','内蒙古自治区']],['辽宁',['Liaoning','辽宁省']],['吉林',['Jilin','吉林省']],['黑龙江',['Heilongjiang','黑龙江省']],['上海',['Shanghai','上海市']],['江苏',['Jiangsu','江苏省']],['浙江',['Zhejiang','浙江省']],['安徽',['Anhui','安徽省']],['福建',['Fujian','福建省']],['江西',['Jiangxi','江西省']],['山东',['Shandong','山东省']],['河南',['Henan','河南省']],['湖北',['Hubei','湖北省']],['湖南',['Hunan','湖南省']],['广东',['Guangdong','广东省']],['广西',['Guangxi','广西壮族自治区']],['海南',['Hainan','海南省']],['重庆',['Chongqing','重庆市']],['四川',['Sichuan','四川省']],['贵州',['Guizhou','贵州省']],['云南',['Yunnan','云南省']],['西藏',['Tibet','Tibet Autonomous Region','西藏自治区']],['陕西',['Shaanxi','陕西省']],['甘肃',['Gansu','甘肃省']],['青海',['Qinghai','青海省']],['宁夏',['Ningxia','宁夏回族自治区']],['新疆',['Xinjiang','新疆维吾尔自治区']],['香港',['Hong Kong','香港特别行政区']],['澳门',['Macao','Macau','澳门特别行政区']],['台湾',['Taiwan','台湾省']]
];
const aliases = new Map(provinces.flatMap(([province, names]) => [province, ...names].map(name => [name.toLowerCase(), province] as const)));
export function normalizeRegion(country: string, value: string): string {return country === 'CN' || country === 'HK' || country === 'MO' || country === 'TW' ? aliases.get(value.trim().toLowerCase()) || value || 'unknown' : value || 'unknown';}
interface GeoSelection {country?:string;region?:string;city?:string;isp?:string}
interface GeoOptions {privacy?:boolean;timezone?:string;from?:string;to?:string}
const normalizedCity=(value:string)=>value.replace(/市$|地区$|自治州$/,'');
/** Hierarchy rows keep siblings available for the map; selected/trend apply all
 * four geographic/provider selectors. IPs are unions, never sums of child rows. */
export function summarizeGeography(events:AnalyticsEvent[],dimensions:GeoSelection={},uvSupported=true,options:GeoOptions={}){
 const privacy=options.privacy??!uvSupported,timezone=options.timezone||'UTC';
 const pages=[...new Map(events.filter(event=>event.type==='pageview').map(event=>[event.event_id,event])).values()];
 const countries=new Map<string,AnalyticsEvent[]>(),regions=new Map<string,AnalyticsEvent[]>(),cities=new Map<string,AnalyticsEvent[]>(),isps=new Map<string,AnalyticsEvent[]>(),days=new Map<string,AnalyticsEvent[]>();
 const selected:AnalyticsEvent[]=[];let known=0;
 const add=(group:Map<string,AnalyticsEvent[]>,key:string,event:AnalyticsEvent)=>{const list=group.get(key)||[];list.push(event);group.set(key,list);};
 for(const event of pages){
  const country=event.dimensions.country||'unknown',region=normalizeRegion(country,event.dimensions.region||'unknown'),city=event.dimensions.city||'unknown',isp=event.dimensions.isp||'unknown';
  if(country!=='unknown'&&region!=='unknown')known++;
  add(countries,country,event);
  if(dimensions.country&&dimensions.country!==country)continue;
  if(!dimensions.isp||dimensions.isp===isp)add(regions,JSON.stringify([country,region]),event);
  if(dimensions.region&&normalizeRegion(country,dimensions.region)!==region)continue;
  if(!dimensions.isp||dimensions.isp===isp)add(cities,JSON.stringify([country,region,city]),event);
  if(dimensions.city&&normalizedCity(dimensions.city)!==normalizedCity(city))continue;
  add(isps,isp,event);
  if(dimensions.isp&&dimensions.isp!==isp)continue;
  selected.push(event);add(days,dayOf(event.ts,timezone),event);
 }
 const metrics=(list:AnalyticsEvent[],daily=false)=>({pv:list.length,uv:daily||uvSupported?new Set(list.map(event=>event.visitor_id)).size:null,...countIPIdentities(list,privacy)});
 const ordered=<T extends {pv:number}>(list:T[])=>list.sort((a,b)=>b.pv-a.pv);
 if(options.from&&options.to&&+new Date(options.to)>+new Date(options.from)){const last=dayOf(new Date(+new Date(options.to)-1),timezone);for(let day=dayOf(options.from,timezone);day<=last;day=new Date(+new Date(day+'T00:00:00Z')+86400000).toISOString().slice(0,10)){if(!days.has(day))days.set(day,[]);}}
 return {
  countries:ordered([...countries].map(([country,list])=>({country,...metrics(list)}))),
  regions:ordered([...regions].map(([key,list])=>{const [country,region]=JSON.parse(key) as [string,string];return {country,region,...metrics(list)};})),
  cities:ordered([...cities].map(([key,list])=>{const [country,region,city]=JSON.parse(key) as [string,string,string];return {country,region,city,...metrics(list)};})),
  isps:ordered([...isps].map(([isp,list])=>({isp,...metrics(list)}))),
  selected:{...dimensions,totals:metrics(selected)},
  trend:[...days].sort(([a],[b])=>a.localeCompare(b)).map(([time,list])=>({time,...metrics(list,true)})),
  geographyCoverage:pages.length?known/pages.length:0,pv:pages.length,uvStatus:uvSupported?'supported':'unsupported_in_this_mode',distinctMethod:'exact_set'
 };
}
export async function registerGeographyAnalytics(app: FastifyInstance, ctx: AppContext) {
 app.get('/api/v1/sites/:siteId/geography', async req => {
  const {siteId} = req.params as {siteId: string}; await ctx.authorize(req, siteId);
  const query = contentFilterSchema.extend({from: z.iso.datetime(), to: z.iso.datetime(), country: z.string().max(64).optional(), region: z.string().max(128).optional(),city:z.string().max(200).optional(),isp:z.string().max(128).optional()}).parse(req.query);
  if (+new Date(query.to) <= +new Date(query.from) || +new Date(query.to) - +new Date(query.from) > 90 * 86400000) throw Object.assign(new Error('地域明细查询限制为90天'), {statusCode: 400});
  const to=new Date(Math.min(Date.now(),+new Date(query.to))).toISOString(),filters=contentFilterSchema.parse(query),selection={country:query.country,region:query.region,city:query.city,isp:query.isp};
  const unavailable=(status:string,storage:unknown={})=>({from:query.from,to,requestedTo:query.to,status,coverage:0,storage,filters,countries:[],regions:[],cities:[],isps:[],trend:[],geographyCoverage:0,selected:{...selection,totals:{pv:null,uv:null,ips:null,knownIps:null,ipCoverage:0,ipStatus:status}},uvStatus:status});
  const snapshot=await withStatsReadSnapshot(ctx,siteId,query.from,to,async client=>{
   const site=(await client.query('SELECT retention_days,privacy_mode,timezone FROM sites WHERE id=$1',[siteId])).rows[0];if(!site)throw Object.assign(new Error('站点不存在'),{statusCode:404});
   if(+new Date(query.from)>=+new Date(to))return unavailable('future_only');
   if(+new Date(query.from)<Date.now()-Number(site.retention_days)*86400000)return unavailable('outside_raw_retention');
   const frontier=(await client.query('SELECT retired_before FROM analytics_raw_retirement_frontiers WHERE site_id=$1',[siteId])).rows[0]?.retired_before;
   if(frontier&&+new Date(query.from)<+new Date(frontier))return unavailable('raw_detail_retired',{retiredBefore:new Date(frontier).toISOString()});
   const {events:data,...storage}=await readSiteEvents(ctx.pool,siteId,{from:query.from,to,type:'pageview',limit:100000,order:'asc',client,statsMirrorRead:true});
   if(storage.truncated)return unavailable('detail_limit_exceeded',storage);if(storage.coverage!==1)return unavailable('detail_unavailable',storage);
   const privacy=site.privacy_mode!=='standard',uvSupported=!privacy||dayOf(query.from,site.timezone)===dayOf(new Date(+new Date(to)-1),site.timezone);
   return {from:query.from,to,requestedTo:query.to,timezone:site.timezone,storage,filters,filterMethod:'retained_event_rebuild',status:'supported',coverage:1,...summarizeGeography(data.filter(event=>eventMatchesFilters(event,filters)),selection,uvSupported,{privacy,timezone:site.timezone,from:query.from,to})};
  });
  const result={...snapshot.value,aggregationPending:snapshot.dirty};if(Buffer.byteLength(JSON.stringify(result))>8*1024*1024)throw new ApplicationError('analytics_query_limit');return result;
 });
}
