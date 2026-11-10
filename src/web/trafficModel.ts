import {type Row} from './api';
import {dateRange,inclusiveEnd} from './time';

export const trafficTabs=[['sites','全部站点'],['daily','数据日报'],['realtime','实时'],['visits','访问明细'],['trend','趋势分析'],['periods','周月分析'],['sources','来路概览'],['sourceSummary','来路汇总'],['searchEngines','搜索引擎'],['referrals','外部链接'],['keywords','关键词'],['pages','受访页面'],['entryPages','入口页面'],['directories','目录分析'],['domains','受访域名'],['visitors','新老访客'],['engagement','互动度'],['environment','系统环境'],['environmentDetails','环境详情'],['geography','地域分布'],['providers','运营商'],['ips','访问IP'],['campaigns','渠道分析'],['channelSettings','渠道设置'],['events','事件分析'],['bots','蜘蛛统计'],['eventManagement','事件管理'],['ipRules','IP过滤']];
export const trafficReportKeys=[...trafficTabs.map(([key])=>key).filter(key=>key!=='sites'),'eventTrend'];
export const metricNames:Record<string,string>={visits:'访问次数',urls:'访问 URL 总数',ips:'IP数',pv:'浏览量(PV)',uv:'访客数(UV)',sessions:'会话数',bounceRate:'跳出率',averageDuration:'平均访问时长',entries:'入口页次数',exits:'退出次数',exitRate:'退出率',newVisitors:'新访客数',returningVisitors:'老访客数',averagePages:'平均访问页数',count:'总次数',averageCount:'人均次数',pageviews:'浏览页数',duration:'访问时长'};
export const primaryMetrics=['ips','pv','uv','sessions','bounceRate','averageDuration'];
export const reportMetrics=['ips','pv','uv','newVisitors','sessions'];
export function metricText(value:unknown,key=''){
 if(typeof value!=='number'||!Number.isFinite(value))return '—';
 if(/Rate$/.test(key))return `${(value*100).toFixed(2)}%`;
 if(['averageDuration','duration'].includes(key)){const n=Math.max(0,Math.round(value));return `${String(Math.floor(n/3600)).padStart(2,'0')}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
 return value.toLocaleString('zh-CN',{maximumFractionDigits:key.startsWith('average')?2:0});
}
export const knownLabels:Record<string,string>={direct:'直接访问',referral:'外部链接',search:'搜索引擎',social:'社交媒体',paid:'付费推广',email:'邮件',internal:'站内跳转',unknown:'未知',desktop:'电脑端',mobile:'移动端',tablet:'平板',new:'新访客',returning:'老访客'};
export function labelText(value:unknown){const s=String(value??'');return knownLabels[s]||s||'—';}
export function reportRows(data:Row,key:string):Row[]{const groups=data.groups as Row|undefined;return Array.isArray(groups?.[key])?(groups[key] as Row[]).map(row=>({...row,averagePages:ratio(row.pv,row.sessions)})):[];}
export function sortReportRows(data:Row[],key:string,desc=true){return data.slice().sort((a,b)=>{const x=a[key],y=b[key];if(x==null)return y==null?0:1;if(y==null)return -1;return (typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),'zh-CN'))*(desc?-1:1);});}
export function ratio(numerator:unknown,denominator:unknown):number|null{return typeof numerator==='number'&&typeof denominator==='number'&&denominator>0?numerator/denominator:null;}
/** Daily reports use the selected final civil day, including DST boundaries. */
export function dailyReportQuery(query:string,timezone:string){const params=new URLSearchParams(query),date=inclusiveEnd(params.get('to')!,timezone),bounds=new URLSearchParams(dateRange(date,date,timezone));params.set('from',bounds.get('from')!);params.set('to',bounds.get('to')!);return params.toString();}
export function previousDayChange(current:unknown,previous:unknown):number|null{return typeof current==='number'&&Number.isFinite(current)&&typeof previous==='number'&&Number.isFinite(previous)&&previous>0?(current-previous)/previous:null;}
