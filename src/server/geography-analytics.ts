import {readSiteEvents} from './event-store.js';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {AppContext} from './context.js';
import {dayOf,sessionize,sessionTimeoutMs,type ContentFilters,type AnalyticsEvent} from './analytics-core.js';
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
interface GeoOptions {privacy?:boolean;timezone?:string;from?:string;to?:string;filters?:ContentFilters;timeoutMs?:number;sessionContextComplete?:boolean;firstSeen?:ReadonlyMap<string,string>}
const normalizedCity=(value:string)=>value.replace(/市$|地区$|自治州$/,'');
/** Hierarchy rows keep siblings available for the map; selected/trend apply all
 * four geographic/provider selectors. IPs are unions, never sums of child rows. */
export function summarizeGeography(events:AnalyticsEvent[],dimensions:GeoSelection={},uvSupported=true,options:GeoOptions={}){
 const privacy=options.privacy??!uvSupported,timezone=options.timezone||'UTC';
 const from=options.from?+new Date(options.from):Number.NEGATIVE_INFINITY,to=options.to?+new Date(options.to):Number.POSITIVE_INFINITY;
 const all=[...new Map(events.filter(event=>+new Date(event.ts)<to).map(event=>[event.event_id,event])).values()];
 const pages=all.filter(event=>event.type==='pageview'&&+new Date(event.ts)>=from&&eventMatchesFilters(event,options.filters||{}));
 const entrySessions=new Map(sessionize(all,timezone,privacy,options.timeoutMs).filter(session=>{const entry=session.events.find(event=>event.type==='pageview')!;return +new Date(session.started_at)>=from&&+new Date(entry.ts)>=from&&eventMatchesFilters(entry,options.filters||{});}).map(session=>[session.events.find(event=>event.type==='pageview')!.event_id,session]));
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
 const metrics=(list:AnalyticsEvent[],daily=false)=>{
  const observed=new Map<string,string>();for(const event of list){const day=dayOf(event.ts,timezone),previous=observed.get(event.visitor_id);if(!previous||day<previous)observed.set(event.visitor_id,day);}
  const periodDay=daily&&list.length?dayOf(list[0]!.ts,timezone):options.from?dayOf(options.from,timezone):[...observed.values()].sort()[0]||'';
  let newVisitors=0,returningVisitors=0,unknownVisitors=0;for(const [visitor,day] of observed){const first=options.firstSeen?.get(visitor);if(!first||first>day)unknownVisitors++;else if(first<periodDay)returningVisitors++;else newVisitors++;}
  const sessions=list.map(event=>entrySessions.get(event.event_id)).filter(session=>session!==undefined),complete=options.sessionContextComplete!==false;
  return {pv:list.length,uv:daily||uvSupported?observed.size:null,...countIPIdentities(list,privacy),sessions:complete?sessions.length:null,bounceRate:complete?(sessions.length?sessions.filter(session=>session.bounced).length/sessions.length:0):null,averageDuration:complete?(sessions.length?sessions.reduce((sum,session)=>sum+session.duration_s,0)/sessions.length:0):null,newVisitors:privacy?null:newVisitors,returningVisitors:privacy?null:returningVisitors,unknownVisitors:privacy?null:unknownVisitors,visitorStatus:privacy?'unsupported_in_this_mode':unknownVisitors?'partial_first_seen':'complete'};
 };
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
   const site=(await client.query('SELECT retention_days,privacy_mode,timezone,config FROM sites WHERE id=$1',[siteId])).rows[0];if(!site)throw Object.assign(new Error('站点不存在'),{statusCode:404});
   if(+new Date(query.from)>=+new Date(to))return unavailable('future_only');
   if(+new Date(query.from)<Date.now()-Number(site.retention_days)*86400000)return unavailable('outside_raw_retention');
   const frontier=(await client.query('SELECT retired_before FROM analytics_raw_retirement_frontiers WHERE site_id=$1',[siteId])).rows[0]?.retired_before;
   if(frontier&&+new Date(query.from)<+new Date(frontier))return unavailable('raw_detail_retired',{retiredBefore:new Date(frontier).toISOString()});
   const timeoutMs=sessionTimeoutMs(site.config),requestedStart=+new Date(query.from)-timeoutMs;
   const {events:data,...storage}=await readSiteEvents(ctx.pool,siteId,{from:new Date(Math.max(requestedStart,frontier?+new Date(frontier):Number.NEGATIVE_INFINITY)),to,limit:100000,order:'asc',client,statsMirrorRead:true});
   const cutoff=storage.retentionBoundary?+new Date(storage.retentionBoundary):Number.NEGATIVE_INFINITY,sessionContextComplete=requestedStart>=cutoff&&(!frontier||requestedStart>=+new Date(frontier));
   const contextOnly=storage.rangeStatus==='outside_raw_retention'&&+new Date(query.from)>=cutoff;
   if(storage.truncated)return unavailable('detail_limit_exceeded',storage);if(storage.coverage!==1&&!contextOnly)return unavailable('detail_unavailable',storage);
   const privacy=site.privacy_mode!=='standard',uvSupported=!privacy||dayOf(query.from,site.timezone)===dayOf(new Date(+new Date(to)-1),site.timezone);
   const ids=privacy?[]:[...new Set(data.filter(event=>event.type==='pageview').map(event=>event.visitor_id))];
   const seen=ids.length?(await client.query('SELECT visitor_id,first_date::text AS first_date FROM visitor_first_seen WHERE site_id=$1 AND visitor_id=ANY($2::text[]) AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=visitor_first_seen.site_id AND t.visitor_id=visitor_first_seen.visitor_id)',[siteId,ids])).rows:[];
   return {from:query.from,to,requestedTo:query.to,timezone:site.timezone,storage,filters,filterMethod:'retained_event_rebuild',status:'supported',coverage:1,sessionStatus:sessionContextComplete?'complete':'partial_session_context',sessionMethod:'session_started_in_range_entry_location',...summarizeGeography(data,selection,uvSupported,{privacy,timezone:site.timezone,from:query.from,to,filters,timeoutMs,sessionContextComplete,firstSeen:new Map(seen.map(row=>[row.visitor_id,row.first_date]))})};
  });
  const result={...snapshot.value,aggregationPending:snapshot.dirty};if(Buffer.byteLength(JSON.stringify(result))>8*1024*1024)throw new ApplicationError('analytics_query_limit');return result;
 });
}
