import {lazy,Suspense,useEffect,useState,type ComponentProps,type ReactNode} from 'react';
import type {OverviewDashboard} from './OverviewDashboard';
import {rows,type Row} from './api';
import {useReportRead} from './DensePrimitives';
import {metricText} from './trafficModel';
import {civilDate,previousDateRange} from './time';
import {FiftyOneChart} from './FiftyOneCharts';
import {dimensionText} from './dimensionLabels';
import './51la-overview.css';
import {ForecastNote} from './ForecastNote';
import {OverviewDateControl} from './OverviewDateControl';

const GeographicMap=lazy(()=>import('./GeographicMap'));
const metrics=[['pv','浏览量(PV)'],['uv','访客数(UV)'],['ips','独立 IP'],['sessions','会话数'],['bounceRate','跳出率'],['averageDuration','平均访问时长']];
type Props=ComponentProps<typeof OverviewDashboard>&{query:string;range:{from:string;to:string};onRange:(from:string,to:string)=>void};
const value=(row:Row|undefined,key:string)=>row?.[key];
function numeric(value:unknown):number|null{return typeof value==='number'&&Number.isFinite(value)?value:null;}
function shift(date:string,days:number){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function Chevron({expanded=false}:{expanded?:boolean}){return <svg className={expanded?'l51-chevron is-expanded':'l51-chevron'} viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>;}
function Panel({title,detail,children,className=''}:{title:string;detail?:ReactNode;children:ReactNode;className?:string}){return <section className={`l51-card ${className}`}><div className="l51-card-heading"><h2>{title}</h2>{detail}</div>{children}</section>;}
function Ranking({data,label,metric='pv',heading='访客数',title,onSelect}:{data:Row[];label:string;metric?:string;heading?:string;title:string;onSelect?:(row:Row)=>void}){
 const list=data.slice(0,10);const max=Math.max(1,...list.map(row=>Number(row[metric])||0));
 return <div className="l51-rank-table" role="region" aria-label={title}><table><thead><tr><th>{label}</th><th>{heading}</th></tr></thead><tbody>{list.map((row,index)=><tr key={index}><td><span className={`l51-rank-index rank-${index+1}`}>{index+1}</span><span className="l51-rank-name" style={{backgroundSize:`${Math.max(0,Number(row[metric])||0)/max*100}% 100%`}} title={String(row.label||row.name||row.path||'—')}>{onSelect?<button onClick={()=>onSelect(row)}>{String(row.label||row.name||row.path||'—')}</button>:String(row.label||row.name||row.path||'—')}</span></td><td>{metricText(row[metric])}</td></tr>)}</tbody></table>{!list.length&&<div className="l51-no-data">暂无数据</div>}</div>;
}

export function FiftyOneOverview({site,data,previous,compare,query,range,onRange,onReport,onFilter,reportHref,refresh=0,geographyStatus}:Props){
 const [selected,setSelected]=useState('pv'),[tick,setTick]=useState(0),[expanded,setExpanded]=useState(false);
 const [mobilePeriod,setMobilePeriod]=useState(0);
 const reportRefresh=`${refresh}:${tick}`;
 const summary=useReportRead(`/api/v1/sites/${site.id}/overview-summary${expanded?'?extended=1':''}`,reportRefresh);
 const traffic=useReportRead(`/api/v1/sites/${site.id}/traffic-report?${query}`,reportRefresh);
 let priorQuery:string|null=null;try{if(compare)priorQuery=previousDateRange(query,site.timezone);}catch{/* A skipped civil date has no comparable period. */}
 const priorTraffic=useReportRead(priorQuery?`/api/v1/sites/${site.id}/traffic-report?${priorQuery}`:null,reportRefresh);
 const geography=useReportRead(`/api/v1/sites/${site.id}/geography?${query}&country=CN`,reportRefresh);
 useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible')setTick(n=>n+1);},30000);return()=>clearInterval(timer);},[]);
 const overview=summary.data;
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
 const detail=(report:string)=><a href={reportHref(report)} onClick={event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onReport(report);}}>查看详情<Chevron/></a>;
 function apply(from:string,to:string){onRange(from,to);}
 return <div className="l51-overview">
  <section className={`l51-summary${expanded?' is-expanded':''}`} aria-label="今日流量概况">
   <div className="l51-summary-heading">
    <h2 title={`按站点时区 ${site.timezone} 统计`}>今日概况</h2>
    <div className="l51-live-card">
     <span>近15分钟活跃</span><strong>{metricText(active.visitors)}</strong>
     <a href={reportHref('realtime')} onClick={event=>{event.preventDefault();onReport('realtime');}}>实时访客<Chevron/></a>
     {summary.error&&<small role="status">实时数据暂不可用</small>}
    </div>
   </div>
   <div className="l51-summary-mobile">
    <div className="l51-mobile-periods" role="group" aria-label="概况统计周期">{timeRows.map(([label],index)=><button key={label} type="button" aria-pressed={mobilePeriod===index} onClick={()=>setMobilePeriod(index)}>{label}</button>)}</div>
    <div className="l51-mobile-metrics">{metrics.map(([key,label])=><div key={key}><span>{label}</span><strong>{metricText((timeRows[mobilePeriod]?.[1]?.totals as Row|undefined)?.[key!],key)}</strong></div>)}</div>
    {expanded&&<div className="l51-mobile-history">{extendedRows.map(([label,row])=><section key={label}><h3>{label}</h3><div className="l51-mobile-metrics">{metrics.map(([key,name])=><div key={key}><span>{name}</span><strong>{metricText((row.totals as Row|undefined)?.[key!],key)}</strong></div>)}</div></section>)}</div>}
   </div>
   <div className="l51-summary-desktop">
    <table className="l51-summary-table" aria-label="今日与历史流量对比">
     <thead><tr><th scope="col">统计时段</th>{metrics.map(([key,label])=><th scope="col" key={key}><span title={key==='ips'?'同一站点内按网络地址去重；未采集独立 IP 的记录显示为空。':undefined}>{label}</span></th>)}</tr></thead>
     <tbody>{timeRows.map(([name,row],index)=><tr key={name} className={index===0?'l51-today-row':name==='预计今日'?'l51-estimate-row':undefined}><th scope="row">{name}</th>{metrics.map(([key])=><td key={key} title={name==='预计今日'?'估算值，随今日流量更新':undefined}>{metricText(value(row.totals as Row,key!),key)}</td>)}</tr>)}</tbody>
     {expanded&&<tbody className="l51-history-rows">{extendedRows.map(([label,row])=><tr key={label}><th scope="row">{label}</th>{metrics.map(([key])=><td key={key}>{metricText(value(row.totals as Row,key!),key)}{label==='历史峰值'&&typeof((extended.peaks as Row|undefined)?.[key!] as Row|undefined)?.date==='string'&&<small>{String(((extended.peaks as Row)[key!] as Row).date)}</small>}</td>)}</tr>)}</tbody>}
    </table>
   </div>
   <div className="l51-summary-footer">
    <button className="l51-summary-expand" type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'收起历史统计':'历史统计'}<Chevron expanded={expanded}/></button>
    <ForecastNote forecast={overview?.forecast as Row|undefined}/>
   </div>
  </section>
  <div className="l51-range-bar"><div role="group" aria-label="日期范围">{[['今日',today,today],['昨日',yesterday,yesterday],['最近七日',shift(today,-6),today],['最近30日',shift(today,-29),today]].map(([label,from,to])=><button key={label} aria-pressed={range.from===from&&range.to===to} onClick={()=>apply(from!,to!)}>{label}</button>)}</div><OverviewDateControl from={range.from} to={range.to} timezone={site.timezone} onApply={apply}/></div>
  <div className="l51-overview-first">
   <Panel title="流量趋势" detail={detail('trend')}><div className="l51-metric-tabs" role="tablist" aria-label="趋势指标">{[['pv','浏览量(PV)'],['uv','访客数(UV)'],['ips','独立 IP'],['newVisitors','新访客数'],['sessions','会话数']].map(([key,label])=><button role="tab" aria-selected={selected===key} key={key} onClick={()=>setSelected(key!)}>{label}</button>)}</div>{currentValues.some(v=>v!==null)?<FiftyOneChart labels={labels} series={series} height={270}/>:<div className="l51-chart-empty">{selected==='ips'?'尚无独立 IP 数据':traffic.error?'数据读取失败':'暂无数据'}</div>}</Panel>
   <Panel title="新老访客" detail={detail('visitors')} className="l51-visitors-panel">
    <FiftyOneChart kind="bar" labels={[range.from===range.to?range.from:range.from+' ~ '+range.to]} series={newOldSeries} height={230}/>
    <div className="l51-visitor-summary">{[['new','新访客'],['returning','老访客']].map(([key,label])=><div key={key}><span>{label}</span><b>{metricText(visitorNumber(trafficVisitors,key!))}</b><strong>{classifiedVisitors>0&&visitorNumber(trafficVisitors,key!)!==null?((visitorNumber(trafficVisitors,key!)!/classifiedVisitors)*100).toFixed(2)+'%':'—'}</strong></div>)}</div>
    {(visitorNumber(trafficVisitors,'unknown')||0)>0&&<p className="l51-classification-note" title="尚未完成新老访客识别的访客计入总数，不归入新访客或老访客。">未分类 {metricText(visitorNumber(trafficVisitors,'unknown'))}</p>}
   </Panel>
  </div>
  <div className="l51-overview-ranks">
   <Panel title="访问来源" detail={detail('sourceSummary')}><Ranking title="来路排名" data={sourceRows} label="来源网站" metric="uv"/></Panel>
   <Panel title="受访页面" detail={detail('pages')}><Ranking title="受访页面排名" data={pageRows} label="页面地址" heading="浏览量" onSelect={row=>onFilter('path',String(row.path))}/></Panel>
   <Panel title="入口页面" detail={detail('entryPages')}><Ranking title="入口页面排名" data={entries} label="页面地址" metric="entries" heading="入口次数" onSelect={row=>onFilter('path',String(row.path))}/></Panel>
  </div>
  <div className="l51-overview-last">
   <Panel title="访客地域" detail={detail('geography')}><div className="l51-geo-body"><div><Suspense fallback={<div className="l51-chart-empty">加载地图…</div>}><GeographicMap region="" values={rows(geography.data?.regions)} onRegion={()=>onReport('geography')} onCity={()=>onReport('geography')}/></Suspense>{['unknown','unavailable','disabled'].includes(String(geographyStatus))&&<small className="l51-geo-note">地域库未配置</small>}</div><Ranking title="地域排名" data={regions} label="省份" metric="uv"/></div></Panel>
   <Panel title="终端设备" detail={detail('environment')}><FiftyOneChart kind="donut" labels={devices.map(row=>row.label)} series={[{name:'终端设备',values:devices.map(row=>numeric(row.pv))}]} height={220}/><ul className="l51-device-legend">{devices.map((row,index)=><li key={row.label}><i className={`device-${index}`} aria-hidden="true"/><span>{row.label}</span><b>{metricText(row.pv)}</b></li>)}</ul></Panel>
  </div>
 </div>;
}
