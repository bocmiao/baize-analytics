import {lazy,Suspense,useState,type ComponentProps} from 'react';
import type {OverviewDashboard} from './OverviewDashboard';
import {overviewValue} from './OverviewDashboard';
import {rows,type Row} from './api';
import {civilDate,dateRange} from './time';
import {DensePanel,Donut,MiniRanking,ReportLink,useReportRead} from './DensePrimitives';
import {metricNames,metricText,reportRows} from './trafficModel';
import {locateTrendAnnotations} from './annotationTrend';
const EvidenceChart=lazy(()=>import('./Charts').then(m=>({default:m.EvidenceChart})));
const GeographicMap=lazy(()=>import('./GeographicMap'));

export function DenseOverview(props:ComponentProps<typeof OverviewDashboard>&{query:string}){
 const {site,data,previous,query,refresh=0,reportHref,onReport,annotations=[],selectedAnnotation,onSelectAnnotation}=props;
 const [metric,setMetric]=useState('pv');const base=`/api/v1/sites/${site.id}`;
 const extra=useReportRead(`${base}/traffic-report?${query}`,refresh);
 const today=civilDate(new Date().toISOString(),site.timezone),yesterday=new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString().slice(0,10);
 const currentDay=useReportRead(`${base}/stats?${dateRange(today,today,site.timezone)}`,refresh),priorDay=useReportRead(`${base}/stats?${dateRange(yesterday,yesterday,site.timezone)}`,refresh);
 const breakdown=extra.data||{};const visitors=(breakdown.visitors||{}) as Row;const live=(breakdown.live||{}) as Row;
 const fields=['ips','pv','uv','sessions','bounceRate','averageDuration','conversions'];
 const points=rows(data.trend).map(r=>({label:String(r.time),value:typeof r[metric]==='number'?r[metric] as number:null}));
 const pStart=Date.parse(String(previous.effectiveFrom||previous.from)),cStart=Date.parse(String(data.effectiveFrom||data.from));
 const previousIndex=new Map(rows(previous.trend).map(r=>[Date.parse(String(r.time))-pStart,r]));
 const comparison=props.compare&&previous.coverage===1&&data.coverage===1?{name:'上一期间',points:rows(data.trend).map(r=>{const p=previousIndex.get(Date.parse(String(r.time))-cStart);return {label:String(p?.time||''),value:typeof p?.[metric]==='number'?p[metric] as number:null};})}:undefined;
 const link=(report:string,text='详情 →')=><ReportLink href={reportHref(report)} onClick={()=>onReport(report)}>{text}</ReportLink>;
 const pageRows=rows(data.pages).sort((a,b)=>Number(b.pv)-Number(a.pv));const entryRows=pageRows.filter(r=>Number(r.entries)>0).sort((a,b)=>Number(b.entries)-Number(a.entries));
 const deviceRows=reportRows(breakdown,'device');const regions=reportRows(breakdown,'region').filter(r=>r.label!=='unknown');
 const newReturning=['new','returning','unknown'].filter(key=>Number(visitors[key])>0).map(key=>({label:key,uv:visitors[key]}));
 const partial=breakdown.coverage!==1;
 const pending=[extra,currentDay,priorDay].some(result=>!result.data&&!result.error);
 return <div className="dense-overview" aria-busy={pending}>
  {pending&&<p className="dense-read-status" role="status">正在读取补充报表…</p>}
  {extra.error&&<p className="dense-info" role="alert">补充报表读取失败：{extra.error}。可通过上方刷新按钮重试。</p>}
  <div className="dense-summary"><section className="panel dense-online"><span><i className="live-dot"/> 最近 15 分钟活跃</span><strong>{metricText((live.active as Row|undefined)?.['15'])}</strong>{link('realtime','查看实时 →')}<small>页面与心跳去重</small></section><section className="panel dense-comparison"><div className="table-wrap"><table><thead><tr><th>统计范围</th>{fields.map(k=><th key={k} title={k==='ips'?'所选范围内去重的 IP 数；旧记录缺少采集标识时显示未采集':undefined}>{metricNames[k]||'目标完成'}</th>)}</tr></thead><tbody>{[{label:'今日',value:currentDay.data},{label:'昨日',value:priorDay.data},{label:'选定范围',value:data},...(props.compare?[{label:'上一期间',value:previous}]:[])].map(({label,value})=><tr key={label} className={label==='选定范围'?'selected-period':''}><th>{label}</th>{fields.map(k=><td key={k}>{value?k==='ips'&&value.ipStatus==='not_collected'?'未采集':overviewValue(k,(value.totals as Row|undefined)?.[k],value.coverage):'—'}</td>)}</tr>)}</tbody></table></div><small>今日 / 昨日为全站数据；选定范围遵循上方日期和筛选。{currentDay.error||priorDay.error?' 日比较暂不可用。':''}</small></section></div>
  <div className="dense-overview-grid">
   <DensePanel title="趋势分析" className="dense-trend" action={link('trend')}><div className="dense-tabs" role="group" aria-label="趋势指标">{['ips','pv','uv','sessions'].map(k=><button key={k} aria-pressed={metric===k} onClick={()=>setMetric(k)}>{metricNames[k]}</button>)}<span>实线：选定范围{comparison?' · 虚线：上一期间':''}</span></div><Suspense fallback={<p className="dense-empty">正在加载趋势…</p>}><EvidenceChart series={{dimension:'time',unit:'count',points}} metricLabel={metricNames[metric]!} timezone={site.timezone} comparisonSeries={comparison} compactLegend openEnded={data.futureClamped===true} annotations={locateTrendAnnotations(annotations,points,site.timezone)} selectedAnnotation={selectedAnnotation} onSelectAnnotation={onSelectAnnotation}/></Suspense></DensePanel>
   <DensePanel title="新老访客" action={link('visitors')}><Donut data={newReturning} metric="uv"/>{partial||site.privacy_mode==='daily_salt'?<p className="dense-note">{extra.error?'访客统计读取失败，可刷新重试。':'当前范围或标识模式无法确定新老访客。'}</p>:<p className="dense-note">新访客：首次记录落在选定范围内；此前已出现的为老访客。</p>}</DensePanel>
   <DensePanel title="来路" action={link('sourceSummary')}><div className="rank-caption"><span>来源网站</span><span>浏览量</span></div><MiniRanking data={reportRows(breakdown,'referrer')}/></DensePanel>
   <DensePanel title="受访页" action={link('pages')}><div className="rank-caption"><span>页面路径</span><span>浏览量</span></div><MiniRanking data={pageRows} label="path" onSelect={value=>{props.onFilter('path',value);onReport('pages');}}/></DensePanel>
   <DensePanel title="入口页" action={link('entryPages')}><div className="rank-caption"><span>会话入口</span><span>入口次数</span></div><MiniRanking data={entryRows} label="path" metric="entries" onSelect={value=>{props.onFilter('path',value);onReport('entryPages');}}/></DensePanel>
   <DensePanel title="地域分布" className="dense-geo" action={link('geography')}><div className="dense-geo-grid">{regions.length?<Suspense fallback={<p>正在加载地图…</p>}><GeographicMap region="" values={regions.map(r=>({region:r.label,pv:r.pv}))} onRegion={()=>onReport('geography')} onCity={()=>onReport('geography')}/></Suspense>:<div className="dense-geo-empty"><svg viewBox="0 0 100 100" width="86" height="86" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="50" cy="50" r="35"/><ellipse cx="50" cy="50" rx="15" ry="35"/><path d="M15 50h70M21 30h58M21 70h58"/></svg><span>暂无可定位的地域数据</span>{link('settings','配置地域数据库 →')}</div>}<div><div className="rank-caption"><span>地区</span><span>浏览量</span></div><MiniRanking data={reportRows(breakdown,'region')}/>{!regions.length&&<p className="dense-note">未知位置保留为未知，不按 IP 推测。</p>}</div></div></DensePanel>
   <DensePanel title="终端设备" action={link('environment')}><Donut data={deviceRows}/><p className="dense-note">同一范围的浏览量组成</p></DensePanel>
  </div>

 </div>;
}
