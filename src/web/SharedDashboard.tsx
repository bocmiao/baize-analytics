import {customerText as c,language} from './customerCopy';
import {useState} from 'react';
import {type Row} from './api';
import {DensePanel,DenseTable} from './DensePrimitives';
import {FiftyOneChart} from './FiftyOneCharts';
import {labelText,metricNames,metricText} from './trafficModel';
import type {SharedReport,SharedRanking} from '../server/shared-dashboard';
import './SharedDashboard.css';

function countryLabel(code:string){try{return /^[A-Z]{2}$/.test(code)?new Intl.DisplayNames([language()],{type:'region'}).of(code)||code:c(labelText(code));}catch{return code;}}
const metrics=['pv','uv','ips','sessions','bounceRate','averageDuration'] as const;
const trendMetrics=['pv','uv','ips','sessions'] as const;
export function SharedDashboard({data}:{data:Row}){
 const [metric,setMetric]=useState<'pv'|'uv'|'ips'|'sessions'>('pv'),report=data.report as SharedReport|undefined;
 if(!report)return <p role="status">{c("暂无统计数据，请稍后重试。")}</p>;
 const timezone=typeof data.timezone==='string'?data.timezone:'UTC',range=data.range as {from:string;to:string}|undefined,coverage=typeof data.coverage==='number'&&Number.isFinite(data.coverage)?Math.max(0,Math.min(1,data.coverage)):null;
 const date=(value:string,year=false)=>new Intl.DateTimeFormat(language(),{timeZone:timezone,...year?{year:'numeric' as const}:{},month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
 const panels:[string,SharedRanking[],string,'country'|'path'|'label'][]=[['流量来源',report.sources,'来源','label'],['设备分布',report.devices,'设备','label'],['国家与地区',report.geography,'国家 / 地区','country'],['热门页面',report.pages,'页面','path']];
 return <div className="shared-dashboard">
  <header className="shared-heading"><h1>{String(data.site_name||c('站点统计'))}</h1>{range&&<p className="dense-note">{date(range.from,true)} — {date(range.to,true)} <span>· {timezone}</span></p>}</header>
  {coverage!==null&&coverage<1&&<p className="shared-coverage" role="status">{c('部分数据不可用，当前覆盖 {coverage}%。',{coverage:Math.round(coverage*100)})}</p>}
  <dl className="shared-metrics">{metrics.map(key=><div key={key}><dt>{c(metricNames[key])}</dt><dd>{metricText(report.totals[key],key)}</dd></div>)}</dl>
  {data.privacy==='daily_salt_no_cross_day_uv'&&<p className="dense-note">{c('隐私模式下不合并跨日访客数和独立 IP。')}</p>}
  <DensePanel title={c('流量趋势')}>
   <div className="shared-metric-tabs" role="group" aria-label={c('选择指标')}>{trendMetrics.map(key=><button type="button" key={key} aria-pressed={metric===key} onClick={()=>setMetric(key)}>{c(metricNames[key])}</button>)}</div>
   <FiftyOneChart labels={report.trend.map(row=>date(row.time))} series={[{name:c(metricNames[metric]),values:report.trend.map(row=>row[metric])}]} height={290}/>
   <details className="feature-disclosure"><summary>{c('查看逐小时明细')}</summary><DenseTable data={report.trend} columns={[{key:'time',label:c('时间'),render:row=>date(String(row.time),true)},...trendMetrics.map(key=>({key,label:c(metricNames[key])}))]} exportName={c('分享流量趋势')} exportLabel={c('导出 CSV')} searchLabel={c('搜索记录')} defaultSort="time"/></details>
  </DensePanel>
  <div className="shared-dashboard-grid">{panels.map(([title,items,label,kind])=>{const values=items.map(row=>({...row,label:kind==='country'?countryLabel(row.label):kind==='path'?row.label:c(labelText(row.label))}));return <DensePanel title={c(title)} key={title}>
   {values.length>0&&<FiftyOneChart kind="bar" labels={values.slice(0,8).map(row=>row.label)} series={[{name:c('浏览量'),values:values.slice(0,8).map(row=>row.pv)}]} height={220}/>}
   <DenseTable data={values} columns={[{key:'label',label:c(label)},{key:'pv',label:c('浏览量')}]} searchLabel={c('查找')+' '+c(label)} exportName={c('分享')+' '+c(title)} exportLabel={c('导出 CSV')} pagination={false}/>
  </DensePanel>;})}</div>
  <footer className="shared-footnote"><p>{c('各榜单最多展示 20 项，搜索和下载仅限当前榜单。')}</p><p>{c('— 表示数据不可用。')}</p></footer>
 </div>;
}
