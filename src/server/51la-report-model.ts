import {dayOf,eventMatchesFilters,sessionize,type AnalyticsEvent,type ContentFilters,type Session} from './analytics-core.js';

export interface TrafficModelOptions {
 from:string;to:string;timezone:string;privacy:boolean;timeoutMs:number;
 filters?:ContentFilters;firstSeen:ReadonlyMap<string,string>;sessionContextComplete?:boolean;
}
export type VisitorType='new'|'returning'|'unknown';
export interface VisitorCounts {new:number|null;returning:number|null;unknown:number|null;status:string}
interface Accumulator {pv:number;visitors:Map<string,string>;sessions:number;bounces:number;duration:number}
export interface TrafficMetric {label:string;pv:number;uv:number|null;ips:null;sessions:number|null;bounceRate:number|null;averageDuration:number|null;newVisitors:number|null;returningVisitors:number|null;unknownVisitors:number|null}
export interface VisitRow {id:string;time:string;visitorKey:string;visitorType:VisitorType;city:string|null;ipPrefix:string|null;browser:string|null;referrer:string|null;entry:string;keyword:string|null;pageviews:number;duration:number;paths:{time:string;path:string}[]}
export interface VisitFilters {visitorType?:VisitorType;referrer?:string;city?:string;entry?:string;visitorKey?:string;ipPrefix?:string;keyword?:string;browser?:string}
const dimensions=['channel','page','entry','visitorType','country','city','referrer','searchEngine','external','keyword','directory','domain','isp','ipPrefix','campaign','utm_source','utm_medium','device','browser','os','screen','language','week','month'] as const;
const blank=():Accumulator=>({pv:0,visitors:new Map(),sessions:0,bounces:0,duration:0});
const timestamp=(event:AnalyticsEvent)=>+new Date(event.ts);
const known=(value:unknown)=>typeof value==='string'&&value&&value!=='unknown'?value:null;
const host=(value:unknown)=>{try{return new URL(String(value)).hostname||null;}catch{return null;}};

/** ISO week follows the site's civil date, not the server's UTC date. */
export function isoWeek(day:string){const date=new Date(day+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+4-(date.getUTCDay()||7));const year=date.getUTCFullYear();return `${year}-W${String(Math.ceil(((+date-Date.UTC(year,0,1))/86400000+1)/7)).padStart(2,'0')}`;}
export function visitorType(visitor:string,day:string,firstSeen:ReadonlyMap<string,string>,privacy=false):VisitorType {
 if(privacy)return 'unknown';const first=firstSeen.get(visitor);return !first||first>day?'unknown':first===day?'new':'returning';
}
export function visitorCounts(events:AnalyticsEvent[],options:Pick<TrafficModelOptions,'from'|'to'|'timezone'|'privacy'|'firstSeen'>):VisitorCounts {
 if(options.privacy)return {new:null,returning:null,unknown:null,status:'unsupported_in_this_mode'};
 const firstDay=dayOf(options.from,options.timezone),lastDay=dayOf(new Date(Math.max(+new Date(options.from),+new Date(options.to)-1)),options.timezone);
 const counts={new:0,returning:0,unknown:0,status:'complete'};
 const selected=new Map<string,string>();for(const event of events){if(event.type!=='pageview'||timestamp(event)<+new Date(options.from)||timestamp(event)>=+new Date(options.to))continue;const day=dayOf(event.ts,options.timezone);const existing=selected.get(event.visitor_id);if(!existing||day<existing)selected.set(event.visitor_id,day);}
 for(const [visitor,observedDay] of selected){const first=options.firstSeen.get(visitor);if(!first||first>observedDay||first>lastDay)counts.unknown++;else if(first<firstDay)counts.returning++;else counts.new++;}
 if(counts.unknown)counts.status='partial_first_seen';return counts;
}
function dimension(event:AnalyticsEvent,key:typeof dimensions[number],options:TrafficModelOptions):string|null {
 const {timezone,privacy}=options;
 const d=event.dimensions;
 switch(key){
  case 'page':return event.path;
  case 'entry':return null;
  case 'visitorType':{if(privacy)return null;const first=options.firstSeen.get(event.visitor_id);return !first||first>dayOf(event.ts,timezone)?'unknown':first<dayOf(options.from,timezone)?'returning':'new';}
  case 'referrer':return known(d.referrer)||'直接访问';
  case 'searchEngine':return d.channel==='search'?known(d.referrer)||'未知搜索引擎':null;
  case 'external':return d.channel!=='search'?known(d.referrer):null;
  case 'keyword':return d.channel==='search'?known(d.keyword)||'未提供关键词':null;
  case 'directory':{const parts=event.path.split('?')[0]!.split('/').filter(Boolean);return parts.length>1?'/'+parts.slice(0,-1).join('/')+'/':'/';}
  case 'domain':return host(event.payload.url)||'未知';
  case 'isp':return null;
  case 'ipPrefix':return privacy?null:known(d.ip_truncated);
  case 'campaign':return known(d.utm_campaign)||'未设置';
  case 'week':return isoWeek(dayOf(event.ts,timezone));
  case 'month':return dayOf(event.ts,timezone).slice(0,7);
  default:return known(d[key])||'未知';
 }
}
function metric(label:string,a:Accumulator,options:TrafficModelOptions,multiDay=false,periodDay=dayOf(options.from,options.timezone)):TrafficMetric {
 const complete=options.sessionContextComplete!==false;
 const counts={newVisitors:0,returningVisitors:0,unknownVisitors:0};if(!options.privacy)for(const [visitor,observedDay] of a.visitors){const first=options.firstSeen.get(visitor);if(!first||first>observedDay)counts.unknownVisitors++;else if(first<periodDay)counts.returningVisitors++;else counts.newVisitors++;}
 return {label,pv:a.pv,uv:options.privacy&&multiDay?null:a.visitors.size,ips:null,sessions:complete?a.sessions:null,bounceRate:complete?(a.sessions?a.bounces/a.sessions:0):null,averageDuration:complete?(a.sessions?a.duration/a.sessions:0):null,...(options.privacy?{newVisitors:null,returningVisitors:null,unknownVisitors:null}:counts)};
}
function addPage(a:Accumulator,event:AnalyticsEvent,day:string){a.pv++;const previous=a.visitors.get(event.visitor_id);if(!previous||day<previous)a.visitors.set(event.visitor_id,day);}
function addSession(a:Accumulator,session:Session){a.sessions++;a.bounces+=Number(session.bounced);a.duration+=session.duration_s;}
/** Page metrics are event-attributed; session metrics use the first pageview. */
export function buildTrafficReport(input:AnalyticsEvent[],options:TrafficModelOptions){
 const from=+new Date(options.from),to=+new Date(options.to),filters=options.filters||{};
 const multiDay=dayOf(options.from,options.timezone)!==dayOf(new Date(Math.max(from,to-1)),options.timezone);
 const firstDay=dayOf(options.from,options.timezone);
 const clock=new Intl.DateTimeFormat('en-GB',{timeZone:options.timezone,minute:'2-digit',second:'2-digit'});
 const hourStart=(ts:number)=>{const parts=clock.formatToParts(new Date(ts));return ts-Number(parts.find(p=>p.type==='minute')!.value)*60000-Number(parts.find(p=>p.type==='second')!.value)*1000-((ts%1000)+1000)%1000;};
 const events=[...new Map(input.filter(e=>timestamp(e)<to).map(e=>[e.event_id,e])).values()];
 const pages=events.filter(e=>e.type==='pageview'&&timestamp(e)>=from&&eventMatchesFilters(e,filters));
 const sessions=sessionize(events,options.timezone,options.privacy,options.timeoutMs).filter(session=>{const entry=session.events.find(e=>e.type==='pageview')!;return timestamp(entry)>=from&&timestamp(entry)<to&&+new Date(session.started_at)>=from&&eventMatchesFilters(entry,filters);});
 const groups=Object.fromEntries(dimensions.map(key=>[key,new Map<string,Accumulator>()])) as Record<typeof dimensions[number],Map<string,Accumulator>>;
 const days=new Map<string,Accumulator>(),dayPages=new Map<string,AnalyticsEvent[]>(),total=blank();
 const hours=new Map<string,Accumulator>();
 const trend={channel:new Map<string,Accumulator>(),page:new Map<string,Accumulator>(),visitorType:new Map<string,Accumulator>()};
 const get=(map:Map<string,Accumulator>,label:string)=>{let value=map.get(label);if(!value){value=blank();map.set(label,value);}return value;};
 for(const event of pages){const day=dayOf(event.ts,options.timezone);addPage(total,event,day);addPage(get(days,day),event,day);if(!multiDay)addPage(get(hours,new Date(hourStart(timestamp(event))).toISOString()),event,day);const daily=dayPages.get(day)||[];daily.push(event);dayPages.set(day,daily);for(const key of dimensions){const label=dimension(event,key,options);if(label!==null){addPage(get(groups[key],label),event,day);if(key==='channel'||key==='page'||key==='visitorType'){const dailyLabel=key==='visitorType'?visitorType(event.visitor_id,day,options.firstSeen,options.privacy):label;addPage(get(trend[key],JSON.stringify([day,dailyLabel])),event,day);}}}}
 for(const session of sessions){const entry=session.events.find(e=>e.type==='pageview')!;addSession(total,session);const day=dayOf(entry.ts,options.timezone);addSession(get(days,day),session);for(const key of dimensions){const label=dimension(entry,key,options);if(label!==null){addSession(get(groups[key],label),session);if(key==='channel'||key==='page'||key==='visitorType'){const dailyLabel=key==='visitorType'?visitorType(entry.visitor_id,day,options.firstSeen,options.privacy):label;addSession(get(trend[key],JSON.stringify([day,dailyLabel])),session);}}}
  if(!multiDay)addSession(get(hours,new Date(hourStart(timestamp(entry))).toISOString()),session);
  const landing=get(groups.entry,entry.path);addSession(landing,session);for(const event of session.events)if(event.type==='pageview')addPage(landing,event,dayOf(event.ts,options.timezone));
 }
 const rows=Object.fromEntries(dimensions.map(key=>[key,[...groups[key]].map(([label,value])=>{let periodDay=firstDay;if(key==='month')periodDay=[firstDay,label+'-01'].sort().at(-1)!;if(key==='week'){const [year,week]=label.split('-W').map(Number),date=new Date(Date.UTC(year!,0,4));date.setUTCDate(date.getUTCDate()-(date.getUTCDay()||7)+1+(week!-1)*7);periodDay=[firstDay,date.toISOString().slice(0,10)].sort().at(-1)!;}return metric(label,value,options,multiDay,periodDay);}).sort((a,b)=>b.pv-a.pv||a.label.localeCompare(b.label))]));
 const dayRows=[...days].sort(([a],[b])=>a.localeCompare(b)).map(([day,value])=>({day,...metric(day,value,options,false,day),pageviewCount:(dayPages.get(day)||[]).length}));
 if(!multiDay)for(let hour=hourStart(from);hour<to;hour+=3600000)get(hours,new Date(hour).toISOString());
 const hourRows=[...hours].sort(([a],[b])=>a.localeCompare(b)).map(([time,value])=>({time,...metric(time,value,options,false,dayOf(time,options.timezone))}));
 const depthLabels=['1 页','2–3 页','4–7 页','8–15 页','16 页及以上'],durationLabels=['不足 10 秒','10–29 秒','30–59 秒','1–3 分钟','3–10 分钟','10 分钟及以上'];
 const depth=depthLabels.map(label=>({label,sessions:0})),duration=durationLabels.map(label=>({label,sessions:0}));
 for(const session of sessions){depth[session.pageviews===1?0:session.pageviews<=3?1:session.pageviews<=7?2:session.pageviews<=15?3:4]!.sessions++;const seconds=session.duration_s;duration[seconds<10?0:seconds<30?1:seconds<60?2:seconds<180?3:seconds<600?4:5]!.sessions++;}
 const visits:VisitRow[]=sessions.map(session=>{const entry=session.events.find(e=>e.type==='pageview')!,d=entry.dimensions;return {id:session.id,time:new Date(entry.ts).toISOString(),visitorKey:session.visitor_id,visitorType:visitorType(session.visitor_id,dayOf(entry.ts,options.timezone),options.firstSeen,options.privacy),city:known(d.city),ipPrefix:options.privacy?null:known(d.ip_truncated),browser:known(d.browser),referrer:known(d.referrer),entry:entry.path,keyword:known(d.keyword),pageviews:session.pageviews,duration:session.duration_s,paths:session.events.filter(e=>e.type==='pageview').map(e=>({time:new Date(e.ts).toISOString(),path:e.path}))};}).sort((a,b)=>b.time.localeCompare(a.time)||a.id.localeCompare(b.id));
 if(options.sessionContextComplete===false)rows.entry=[];
 const dimensionTrend=Object.fromEntries((['channel','page','visitorType'] as const).map(key=>{const leaders=new Set(key==='visitorType'?['new','returning','unknown']:rows[key]!.slice(0,5).map(row=>row.label));return [key,[...trend[key]].flatMap(([id,value])=>{const [time,label]=JSON.parse(id) as [string,string];return leaders.has(label)?[{time,...metric(label,value,options,false,time)}]:[];}).sort((a,b)=>a.time.localeCompare(b.time)||a.label.localeCompare(b.label))];}));
 return {groups:rows,days:dayRows,hours:hourRows,dimensionTrend,totals:metric('全部',total,options,multiDay),visitors:visitorCounts(pages,options),engagement:options.sessionContextComplete===false?{depth:[],duration:[]}:{depth,duration},visits};
}
export function filterVisits(rows:VisitRow[],filters:VisitFilters){return rows.filter(row=>Object.entries(filters).every(([key,value])=>value===undefined||value===''||row[key as keyof VisitFilters]===value));}

/** Counts the whole bounded window, never a recent-events preview. */
export function buildLiveTraffic(events:AnalyticsEvent[],asOf:string,timezone:string,privacy:boolean,filters:ContentFilters={}){
 const end=+new Date(asOf),begin=end-30*60000,selected=[...new Map(events.filter(e=>timestamp(e)>=begin&&timestamp(e)<end&&eventMatchesFilters(e,filters)).map(e=>[e.event_id,e])).values()];
 const active:Record<string,number|null>={},pageviews=Array<number>(30).fill(0),paths=new Map<string,number>();
 for(const event of selected)if(event.type==='pageview'){pageviews[Math.min(29,Math.floor((timestamp(event)-begin)/60000))]!++;paths.set(event.path,(paths.get(event.path)||0)+1);}
 for(const minutes of [5,15,30]){const from=end-minutes*60000;active[minutes]=privacy&&dayOf(new Date(from),timezone)!==dayOf(new Date(end-1),timezone)?null:new Set(selected.filter(e=>timestamp(e)>=from&&(e.type==='pageview'||e.type==='heartbeat')).map(e=>e.visitor_id)).size;}
 return {from:new Date(begin).toISOString(),to:asOf,active,pageviews,pages:[...paths].map(([path,pv])=>({path,pv})).sort((a,b)=>b.pv-a.pv||a.path.localeCompare(b.path)),method:'pageview_or_heartbeat_distinct',coverage:1,status:'complete'};
}
