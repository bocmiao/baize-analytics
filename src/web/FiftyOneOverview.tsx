import {lazy,Suspense,useEffect,useState,type ComponentProps,type ReactNode} from 'react';
import type {OverviewDashboard} from './OverviewDashboard';
import {api,rows,type Row} from './api';
import {useReportRead} from './DensePrimitives';
import {metricText} from './trafficModel';
import {civilDate,dateRange,previousDateRange} from './time';
import {FiftyOneChart} from './FiftyOneCharts';
import {dimensionText} from './dimensionLabels';
import './51la-overview.css';
import {ForecastNote} from './ForecastNote';

const GeographicMap=lazy(()=>import('./GeographicMap'));
const metrics=[['ips','IP数'],['pv','浏览量(PV)'],['uv','访客数(UV)'],['sessions','会话数'],['bounceRate','跳出率'],['averageDuration','平均访问时长']];
type Props=ComponentProps<typeof OverviewDashboard>&{query:string;range:{from:string;to:string};onRange:(from:string,to:string)=>void};
const value=(row:Row|undefined,key:string)=>row?.[key];
function numeric(value:unknown):number|null{return typeof value==='number'&&Number.isFinite(value)?value:null;}
function shift(date:string,days:number){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function CardIcon({kind='trend'}:{kind?:string}){return <span className={`l51-card-icon l51-icon-${kind}`} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{kind==='people'?<><circle cx="9" cy="7" r="3"/><path d="M3 20v-4a6 6 0 0 1 12 0v4M16 4a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3"/></>:kind==='device'?<><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M7 21h10m-5-4v4"/></>:kind==='geo'?<><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3ZM9 3v15m6-12v15"/></>:kind==='page'?<><path d="M6 2h8l4 4v16H6ZM14 2v5h5M9 12h6m-6 4h6"/></>:kind==='entry'?<><path d="M14 3h7v18h-7M2 12h14m-5-5 5 5-5 5"/></>:<><path d="M3 4v16h18M6 15l5-6 4 3 5-7"/></>}</svg></span>;}
function Panel({title,kind,detail,children,className=''}:{title:string;kind?:string;detail?:ReactNode;children:ReactNode;className?:string}){return <section className={`l51-card ${className}`}><div className="l51-card-heading"><h2><CardIcon kind={kind}/>{title}</h2>{detail}</div>{children}</section>;}
function Ranking({data,label,metric='pv',heading='访客数',title,onSelect}:{data:Row[];label:string;metric?:string;heading?:string;title:string;onSelect?:(row:Row)=>void}){
 const list=data.slice(0,10);const max=Math.max(1,...list.map(row=>Number(row[metric])||0));
 return <div className="l51-rank-table" role="region" aria-label={title}><table><thead><tr><th>{label}</th><th>{heading}</th></tr></thead><tbody>{list.map((row,index)=><tr key={index}><td><span className={`l51-rank-index rank-${index+1}`}>{index+1}</span><span className="l51-rank-name" style={{backgroundSize:`${Math.max(0,Number(row[metric])||0)/max*100}% 100%`}} title={String(row.label||row.name||row.path||'—')}>{onSelect?<button onClick={()=>onSelect(row)}>{String(row.label||row.name||row.path||'—')}</button>:String(row.label||row.name||row.path||'—')}</span></td><td>{metricText(row[metric])}</td></tr>)}</tbody></table>{!list.length&&<div className="l51-no-data">暂无数据</div>}</div>;
}

export function FiftyOneOverview({site,data,previous,compare,query,range,onRange,onReport,onFilter,reportHref,refresh=0,geographyStatus}:Props){
 const [selected,setSelected]=useState('pv'),[tick,setTick]=useState(0),[expanded,setExpanded]=useState(false),[calendar,setCalendar]=useState(false),[draftFrom,setDraftFrom]=useState(range.from),[draftTo,setDraftTo]=useState(range.to);
 const [mobilePeriod,setMobilePeriod]=useState(0);
 const [summary,setSummary]=useState<{site:string;data?:Row;error?:string}>({site:site.id});
 const reportRefresh=`${refresh}:${tick}`;
 const traffic=useReportRead(`/api/v1/sites/${site.id}/traffic-report?${query}`,reportRefresh);
 let priorQuery:string|null=null;try{if(compare)priorQuery=previousDateRange(query,site.timezone);}catch{/* A skipped civil date has no comparable period. */}
 const priorTraffic=useReportRead(priorQuery?`/api/v1/sites/${site.id}/traffic-report?${priorQuery}`:null,reportRefresh);
 const geography=useReportRead(`/api/v1/sites/${site.id}/geography?${query}&country=CN`,reportRefresh);
 useEffect(()=>{setDraftFrom(range.from);setDraftTo(range.to);},[range.from,range.to]);
 useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible')setTick(n=>n+1);},30000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{const controller=new AbortController();setSummary(old=>old.site===site.id?old:{site:site.id});void api<Row>(`/api/v1/sites/${site.id}/overview-summary${expanded?'?extended=1':''}`,undefined,'GET',controller.signal).then(result=>{if(!controller.signal.aborted)setSummary({site:site.id,data:result});}).catch(error=>{if(!controller.signal.aborted)setSummary({site:site.id,error:error.message});});return()=>controller.abort();},[site.id,refresh,tick,expanded]);
 const overview=summary.site===site.id?summary.data:undefined;
 const extended=(overview?.extended||{}) as Row;
 const extendedRows:[string,Row][]=[['本月合计',(extended.thisMonth||{}) as Row],['总流量',(extended.total||{}) as Row],['历史峰值',{totals:Object.fromEntries(metrics.map(([key])=>[key,((extended.peaks as Row|undefined)?.[key!] as Row|undefined)?.value]))}]];
 const today=civilDate(new Date().toISOString(),site.timezone),yesterday=shift(today,-1);
 const groups=(traffic.data?.groups||{}) as Record<string,Row[]>;
 const days=rows(traffic.data?.days);
 const active=(overview?.active15||{}) as Row;
 const timeRows:[string,Row][]=[['今日',(overview?.today||{}) as Row],['昨日',(overview?.yesterday||{}) as Row],['预计今日',{totals:overview?.forecast||{}}],['昨日此时',(overview?.yesterdaySameTime||{}) as Row]];
 const sameDay=range.from===range.to;
 const chartRows=!sameDay?days:rows(traffic.data?.hours).length?rows(traffic.data?.hours):rows(data.trend);
 const labels=chartRows.map(row=>{const stamp=String(row.time||row.day||row.date||'');const d=new Date(stamp);if(!Number.isFinite(+d))return stamp;return new Intl.DateTimeFormat('zh-CN',{timeZone:site.timezone,...sameDay?{hour:'2-digit',hourCycle:'h23'}:{month:'2-digit',day:'2-digit'}}).format(d);});
 const chartMetric=selected==='newVisitors'?'newVisitors':selected;
 const currentValues=chartRows.map(row=>numeric(row[chartMetric]));
 const previousRows=sameDay?(rows(priorTraffic.data?.hours).length?rows(priorTraffic.data?.hours):rows(previous.trend)):rows(priorTraffic.data?.days);
 const canCompare=compare&&(priorTraffic.data?.coverage===1||previous.coverage===1)&&previousRows.length>=chartRows.length;
 const series=[{name:range.from===range.to?range.from:`${range.from} ~ ${range.to}`,values:currentValues},...(canCompare?[{name:sameDay?shift(range.from,-1):'上一周期',values:previousRows.slice(0,chartRows.length).map(row=>numeric(row[chartMetric]))}]:[])];
 const trafficVisitors=(traffic.data?.visitors||{}) as Row;
 const visitorNumber=(record:Row|undefined,key:string)=>numeric(typeof record?.[key]==='object'?(record[key] as Row).uv:record?.[key]);
 const newOldSeries=[{name:'新访客',values:[visitorNumber(trafficVisitors,'new')]},{name:'老访客',values:[visitorNumber(trafficVisitors,'returning')]}];
 const classifiedVisitors=(visitorNumber(trafficVisitors,'new')||0)+(visitorNumber(trafficVisitors,'returning')||0)+(visitorNumber(trafficVisitors,'unknown')||0);
 const sourceRows=(groups.referrer||rows(data.sources).map(row=>({...row,label:row.referrer||dimensionText('channel',row.channel)}))).filter(row=>Number(row.pv||row.uv)>0);
 const pageRows:Row[]=rows(data.pages).slice().sort((a,b)=>Number(b.pv||0)-Number(a.pv||0)).map(row=>({...row,label:String(row.path||'')}));
 const entries=pageRows.filter(row=>Number(row.entries)>0).sort((a,b)=>Number(b.entries)-Number(a.entries));
 const regions=rows(geography.data?.regions).map(row=>({...row,label:String(row.region)}));
 const rawDevices=groups.device||Object.entries(((data.audience as Row|undefined)?.device||{}) as Row).map(([label,pv])=>({label,pv}));
 const devices=['desktop','mobile','other'].map(key=>({label:key==='desktop'?'电脑端':key==='mobile'?'移动端':'其他',pv:rawDevices.filter(row=>key==='other'?!['desktop','mobile'].includes(String(row.label)):row.label===key).reduce((sum,row)=>sum+(Number(row.pv)||0),0)}));
 const detail=(report:string)=><a href={reportHref(report)} onClick={event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onReport(report);}}>详情 <span aria-hidden="true">›</span></a>;
 function apply(from:string,to:string){onRange(from,to);setCalendar(false);}
 return <div className="l51-overview">
  <div className={`l51-overview-top${expanded?' is-expanded':''}`}>
   <section className="l51-live-card"><h2><span aria-hidden="true">◈</span> 最近15分钟活跃访客数</h2><strong>{metricText(active.visitors)}</strong><a href={reportHref('realtime')} onClick={event=>{event.preventDefault();onReport('realtime');}}>查看实时 <span aria-hidden="true">›</span></a>{summary.error&&<small role="status">实时数据暂不可用</small>}</section>
   <section className="l51-summary">
    <div className="l51-summary-mobile"><div className="l51-mobile-periods" role="group" aria-label="概况统计周期">{timeRows.map(([label],index)=><button key={label} type="button" aria-pressed={mobilePeriod===index} onClick={()=>setMobilePeriod(index)}>{label}</button>)}</div><div className="l51-mobile-metrics">{metrics.map(([key,label])=><div key={key}><span>{label}</span><strong>{metricText((timeRows[mobilePeriod]?.[1]?.totals as Row|undefined)?.[key!],key)}</strong></div>)}</div>{expanded&&<div className="l51-mobile-history">{extendedRows.map(([label,row])=><section key={label}><h3>{label}</h3><div className="l51-mobile-metrics">{metrics.map(([key,name])=><div key={key}><span>{name}</span><strong>{metricText((row.totals as Row|undefined)?.[key!],key)}</strong></div>)}</div></section>)}</div>}</div>
    <div className="l51-summary-grid"><div className="l51-summary-labels"><span/><span>今日</span><span>昨日</span><span>预计今日</span><span>昨日此时</span></div>{metrics.map(([key,label])=><div key={key} className="l51-summary-metric"><span className="l51-summary-name">{label} <span title={key==='ips'?'按站点内的独立网络地址去重；早期未采集的记录不补造。 ':label} aria-label={label+'说明'}>ⓘ</span></span>{timeRows.map(([name,row],index)=><span key={name} className={index===0?'l51-today-value':''} title={name==='预计今日'?'依据历史日内分布和当前流量估算，实际结果会变化':undefined}>{metricText(value(row.totals as Row,key!),key)}</span>)}</div>)}</div>
    {expanded&&<div className="l51-summary-grid l51-history-grid"><div className="l51-history-labels">{extendedRows.map(([label])=><span key={label}>{label}</span>)}</div>{metrics.map(([key])=><div key={key} className="l51-history-metric">{extendedRows.map(([label,row])=><span key={label}>{metricText(value(row.totals as Row,key!),key)}{label==='历史峰值'&&typeof((extended.peaks as Row|undefined)?.[key!] as Row|undefined)?.date==='string'&&<small>({String(((extended.peaks as Row)[key!] as Row).date)})</small>}</span>)}</div>)}</div>}
    <button className="l51-summary-expand" type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)} aria-label={expanded?'收起历史统计':'展开历史统计'}>{expanded?'⌃':'⌄'}</button>
   </section>
  </div>
  <ForecastNote forecast={overview?.forecast as Row|undefined}/>
  <div className="l51-range-bar"><div role="group" aria-label="日期范围">{[['今日',today,today],['昨日',yesterday,yesterday],['最近七日',shift(today,-6),today],['最近30日',shift(today,-29),today]].map(([label,from,to])=><button key={label} aria-pressed={range.from===from&&range.to===to} onClick={()=>apply(from!,to!)}>{label}</button>)}</div><div className="l51-calendar-control"><button aria-expanded={calendar} onClick={()=>setCalendar(v=>!v)} aria-label="自定义日期范围">▦ {range.from} ~ {range.to}</button>{calendar&&<form onSubmit={event=>{event.preventDefault();try{dateRange(draftFrom,draftTo,site.timezone);apply(draftFrom,draftTo);}catch{/* Native date inputs retain the invalid selection for correction. */}}} className="l51-date-popover"><label>开始日期<input type="date" required value={draftFrom} max={draftTo} onChange={event=>setDraftFrom(event.target.value)}/></label><label>结束日期<input type="date" required value={draftTo} min={draftFrom} onChange={event=>setDraftTo(event.target.value)}/></label><button type="submit">确定</button><button type="button" onClick={()=>setCalendar(false)}>取消</button></form>}</div></div>
  <div className="l51-overview-first">
   <Panel title="趋势分析" detail={detail('trend')}><div className="l51-metric-tabs" role="tablist" aria-label="趋势指标">{[['ips','IP数'],['pv','浏览量(PV)'],['uv','访客数(UV)'],['newVisitors','新访客数'],['sessions','会话数']].map(([key,label])=><button role="tab" aria-selected={selected===key} key={key} onClick={()=>setSelected(key!)}>{label}</button>)}</div>{currentValues.some(v=>v!==null)?<FiftyOneChart labels={labels} series={series} height={270}/>:<div className="l51-chart-empty">{selected==='ips'?'尚无独立 IP 数据':traffic.error?'数据读取失败':'暂无数据'}</div>}</Panel>
   <div className="l51-newold"><Panel title="新老访客" kind="people" detail={detail('visitors')}><FiftyOneChart kind="bar" labels={[range.from===range.to?range.from:range.from+' ~ '+range.to]} series={newOldSeries} height={202}/></Panel><div className="l51-visitor-summary">{[['new','新访客'],['returning','老访客']].map(([key,label])=><div key={key}><CardIcon kind="people"/><span>{label}<b>{metricText(visitorNumber(trafficVisitors,key!))}</b></span><strong>{classifiedVisitors>0&&visitorNumber(trafficVisitors,key!)!==null?((visitorNumber(trafficVisitors,key!)!/classifiedVisitors)*100).toFixed(2)+'%':'—'}</strong></div>)}</div></div>
  </div>
  <div className="l51-overview-ranks">
   <Panel title="来路" kind="entry" detail={detail('sourceSummary')}><Ranking title="来路排名" data={sourceRows} label="来路网站" metric="uv"/></Panel>
   <Panel title="受访页" kind="page" detail={detail('pages')}><Ranking title="受访页面排名" data={pageRows} label="页面地址" heading="查看次数" onSelect={row=>onFilter('path',String(row.path))}/></Panel>
   <Panel title="入口页" kind="entry" detail={detail('entryPages')}><Ranking title="入口页面排名" data={entries} label="页面地址" metric="entries" heading="入口次数" onSelect={row=>onFilter('path',String(row.path))}/></Panel>
  </div>
  <div className="l51-overview-last">
   <Panel title="地域" kind="geo" detail={detail('geography')}><div className="l51-geo-body"><div><Suspense fallback={<div className="l51-chart-empty">加载地图…</div>}><GeographicMap region="" values={rows(geography.data?.regions)} onRegion={()=>onReport('geography')} onCity={()=>onReport('geography')}/></Suspense>{['unknown','unavailable','disabled'].includes(String(geographyStatus))&&<small className="l51-geo-note">地域库未配置</small>}</div><Ranking title="地域排名" data={regions} label="省份" metric="uv"/></div></Panel>
   <Panel title="终端设备" kind="device" detail={detail('environment')}><FiftyOneChart kind="donut" labels={devices.map(row=>row.label)} series={[{name:'终端设备',values:devices.map(row=>numeric(row.pv))}]} height={220}/><ul className="l51-device-legend">{devices.map((row,index)=><li key={row.label}><i className={`device-${index}`}/><span>{row.label}</span><b>{metricText(row.pv)}</b></li>)}</ul></Panel>
  </div>
 </div>;
}
