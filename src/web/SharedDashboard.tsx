import {customerText as c,language} from './customerCopy';
import {useState} from 'react';
import {type Row} from './api';
import {DensePanel,DenseTable,MetricStrip,MetricTabs} from './DensePrimitives';
import {FiftyOneChart} from './FiftyOneCharts';
import {labelText,metricNames} from './trafficModel';
import type {SharedReport,SharedRanking} from '../server/shared-dashboard';
import './SharedDashboard.css';

function countryLabel(code:string){try{return /^[A-Z]{2}$/.test(code)?new Intl.DisplayNames([language()],{type:'region'}).of(code)||code:labelText(code);}catch{return code;}}
export function SharedDashboard({data}:{data:Row}){
 const [metric,setMetric]=useState<'pv'|'uv'|'ips'|'sessions'>('pv'),report=data.report as SharedReport|undefined;
 if(!report)return <p role="status">{c("暂无统计数据，请稍后重试。")}</p>;
 const timezone=typeof data.timezone==='string'?data.timezone:'UTC',range=data.range as {from:string;to:string}|undefined,coverage=typeof data.coverage==='number'?data.coverage:0;
 const date=(value:string)=>new Intl.DateTimeFormat(language(),{timeZone:timezone,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
 const panels:[string,SharedRanking[],string][]=[[c('流量来源'),report.sources,c('来源')],[c('设备分布'),report.devices,c('设备')],[c('国家与地区'),report.geography,c('国家 / 地区')],[c('热门页面'),report.pages,c('页面')]];
 return <div className="shared-dashboard"><header><h1>{String(data.site_name||c('站点统计'))}</h1>{range&&<p className="dense-note">{date(range.from)} — {date(range.to)} · {timezone}</p>}</header>{(data.rangeStatus!=='complete'||coverage<1)&&<p className="shared-coverage" role="status">{c('部分数据不可用，当前覆盖 {coverage}%。',{coverage:Math.round(coverage*100)})}</p>}<MetricStrip totals={report.totals} metrics={['pv','uv','ips','sessions','bounceRate','averageDuration']}/>{data.privacy!=='standard'&&<p className="dense-note">{c("隐私模式下不合并跨日访客数和独立 IP。")}</p>}<DensePanel title={c("流量趋势")}><MetricTabs metrics={['pv','uv','ips','sessions']} value={metric} onChange={value=>setMetric(value as typeof metric)}/><FiftyOneChart labels={report.trend.map(row=>date(row.time))} series={[{name:c(metricNames[metric]||metric),values:report.trend.map(row=>row[metric])}]} height={290}/><details className="feature-disclosure"><summary>{c("查看逐小时明细")}</summary><DenseTable data={report.trend.map(row=>({...row,time:date(row.time)}))} columns={[{key:'time',label:c('时间')},...['pv','uv','ips','sessions'].map(key=>({key,label:c(metricNames[key]||key)}))]} exportName={c("分享流量趋势")} defaultSort="time"/></details></DensePanel><div className="shared-dashboard-grid">{panels.map(([title,items,label])=>{const values=items.map(row=>({...row,label:title===c('国家与地区')?countryLabel(row.label):title===c('热门页面')?row.label:c(labelText(row.label))}));return <DensePanel title={title} key={title}><p className="dense-note">{c("浏览量前 20 项")}</p>{values.length>0&&<FiftyOneChart kind="bar" labels={values.slice(0,8).map(row=>row.label)} series={[{name:c('浏览量'),values:values.slice(0,8).map(row=>row.pv)}]} height={220}/>}<DenseTable data={values} columns={[{key:'label',label},{key:'pv',label:c('浏览量')}]} searchLabel={c('查找')+' '+label} exportName={c('分享')+' '+title}/></DensePanel>;})}</div><p className="dense-note">{c("— 表示数据不可用。")}</p></div>;
}
