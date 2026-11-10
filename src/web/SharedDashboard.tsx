import {useState} from 'react';
import {type Row} from './api';
import {DensePanel,DenseTable,MetricStrip,MetricTabs} from './DensePrimitives';
import {FiftyOneChart} from './FiftyOneCharts';
import {labelText,metricNames} from './trafficModel';
import type {SharedReport,SharedRanking} from '../server/shared-dashboard';
import './SharedDashboard.css';

function countryLabel(code:string){try{return /^[A-Z]{2}$/.test(code)?new Intl.DisplayNames(['zh-CN'],{type:'region'}).of(code)||code:labelText(code);}catch{return code;}}
export function SharedDashboard({data}:{data:Row}){
 const [metric,setMetric]=useState<'pv'|'uv'|'ips'|'sessions'>('pv'),report=data.report as SharedReport|undefined;
 if(!report)return <p role="status">当前分享尚无可用汇总，请稍后重新打开。</p>;
 const timezone=typeof data.timezone==='string'?data.timezone:'UTC',range=data.range as {from:string;to:string}|undefined,coverage=typeof data.coverage==='number'?data.coverage:0;
 const date=(value:string)=>new Intl.DateTimeFormat('zh-CN',{timeZone:timezone,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
 const panels:[string,SharedRanking[],string][]=[['流量来源',report.sources,'来源'],['设备分布',report.devices,'设备'],['国家与地区',report.geography,'国家 / 地区'],['热门页面',report.pages,'页面']];
 return <div className="shared-dashboard"><header><p className="dense-note">只读统计看板 · 最近 30 天</p><h1>{String(data.site_name||'站点统计')}</h1>{range&&<p className="dense-note">{date(range.from)} — {date(range.to)} · {timezone}</p>}</header>{(data.rangeStatus!=='complete'||coverage<1)&&<p className="shared-coverage" role="status">部分数据尚未聚合或不可用，当前仅展示可用部分。读取覆盖率 {Math.round(coverage*100)}%。</p>}<MetricStrip totals={report.totals} metrics={['pv','uv','ips','sessions','bounceRate','averageDuration']}/>{data.privacy!=='standard'&&<p className="dense-note">此站点按天更新访客标识，跨日访客数和独立 IP 不合并为一个数字；趋势保留每个时段的统计。</p>}<DensePanel title="流量趋势"><MetricTabs metrics={['pv','uv','ips','sessions']} value={metric} onChange={value=>setMetric(value as typeof metric)}/><FiftyOneChart labels={report.trend.map(row=>date(row.time))} series={[{name:metricNames[metric]||metric,values:report.trend.map(row=>row[metric])}]} height={290}/><details className="feature-disclosure"><summary>查看逐小时明细</summary><DenseTable data={report.trend.map(row=>({...row,time:date(row.time)}))} columns={[{key:'time',label:'时间'},...['pv','uv','ips','sessions'].map(key=>({key,label:metricNames[key]||key}))]} exportName="分享流量趋势" defaultSort="time"/></details></DensePanel><div className="shared-dashboard-grid">{panels.map(([title,items,label])=>{const values=items.map(row=>({...row,label:title==='国家与地区'?countryLabel(row.label):title==='热门页面'?row.label:labelText(row.label)}));return <DensePanel title={title} key={title}><p className="dense-note">按浏览量排序，最多展示前 20 项</p>{values.length>0&&<FiftyOneChart kind="bar" labels={values.slice(0,8).map(row=>row.label)} series={[{name:'浏览量',values:values.slice(0,8).map(row=>row.pv)}]} height={220}/>}<DenseTable data={values} columns={[{key:'label',label},{key:'pv',label:'浏览量'}]} searchLabel={'查找'+label} exportName={'分享'+title}/></DensePanel>;})}</div><p className="dense-note">这里只展示站长授权的汇总信息。— 表示当前口径无法提供该数值。</p></div>;
}
