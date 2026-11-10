import {lazy,Suspense,useState} from 'react';
import {rows,type Row,type Site} from './api';
import {DensePanel,DenseTable,useReportRead} from './DensePrimitives';
import './advanced-analysis.css';
const Chart=lazy(()=>import('./FiftyOneCharts').then(module=>({default:module.FiftyOneChart})));
const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null;
export function EventAnalysis({site,query,refresh,onManage}:{site:Site;query:string;refresh:number|string;onManage?:()=>void}){
 const [names,setNames]=useState<string[]>([]),[event,setEvent]=useState(''),[metric,setMetric]=useState('count'),[kind,setKind]=useState<'line'|'bar'>('line');
 const params=new URLSearchParams(query);params.delete('names');names.forEach(name=>params.append('names',name));if(event)params.set('event',event);
 const result=useReportRead(`/api/v1/sites/${site.id}/event-analysis?${params}`,refresh),data=result.data,events=rows(data?.events),trend=rows(data?.trend),selected=(data?.selectedNames||[]) as string[];
 const definitions=new Map(rows(data?.definitions).map(row=>[String(row.name),String(row.displayName)])),label=(name:string)=>definitions.get(name)||name;
 const labels=trend.map(row=>data?.granularity==='hour'?new Intl.DateTimeFormat('zh-CN',{timeZone:site.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(String(row.time))):String(row.time));
 const series=selected.map(name=>({name:label(name),values:trend.map(row=>number(((row.events as Row)?.[name] as Row)?.[metric]))}));
 return <><DensePanel title="事件概览" action={onManage&&<button type="button" className="secondary" onClick={onManage}>管理事件</button>}>
  {result.error&&<p role="alert" className="error">{result.error}</p>}{!data&&!result.error&&<p role="status">正在读取事件…</p>}{data&&data.status!=='complete'&&<p className="notice">当前范围的事件明细不完整，请缩短日期范围或检查明细保留期。</p>}{data?.uvStatus==='unsupported_in_this_mode'&&<p className="dense-note">当前访客模式每天更新标识，跨日去重人数和人均次数显示为 —；每日趋势仍可查看。</p>}
  <DenseTable data={events.map(row=>({...row,displayName:label(String(row.name))}))} defaultSort="count" exportName="事件分析" columns={[{key:'displayName',label:'事件名称',render:row=><button className="dense-text-button" onClick={()=>{setEvent(String(row.name));setNames([String(row.name)]);}}>{String(row.displayName)}</button>},{key:'name',label:'事件标识'},{key:'count',label:'触发次数'},{key:'uv',label:'触发人数'},{key:'averageCount',label:'人均次数',render:row=>number(row.averageCount)?.toFixed(2)||'—'}]}/>
 </DensePanel><DensePanel title="事件趋势"><div className="advanced-controls"><label>查看指标<select value={metric} onChange={e=>setMetric(e.target.value)}><option value="count">触发次数</option><option value="uv">触发人数</option><option value="averageCount">人均次数</option></select></label><label>图表<select value={kind} onChange={e=>setKind(e.target.value as 'line'|'bar')}><option value="line">折线图</option><option value="bar">柱状图</option></select></label></div>
  <fieldset className="advanced-event-picker"><legend>对比事件 · 最多5项</legend>{events.map(row=>{const name=String(row.name),checked=selected.includes(name);return <label key={name}><input type="checkbox" checked={checked} disabled={!checked&&selected.length>=5||checked&&selected.length===1} onChange={()=>setNames(checked?selected.filter(value=>value!==name):[...selected,name])}/>{label(name)}</label>;})}{events.length===0&&<span>当前范围尚无事件</span>}</fieldset>
  <Suspense fallback={<p>正在载入图表…</p>}><Chart kind={kind} labels={labels} series={series}/></Suspense>
 </DensePanel><DensePanel title="事件参数"><label className="advanced-inline">选择事件<select value={event} onChange={e=>setEvent(e.target.value)}><option value="">请选择事件</option>{events.map(row=><option key={String(row.name)} value={String(row.name)}>{label(String(row.name))}</option>)}</select></label>{event?<DenseTable data={rows(data?.properties)} defaultSort="count" exportName="事件参数" columns={[{key:'key',label:'参数名'},{key:'value',label:'参数值'},{key:'valueType',label:'值类型'},{key:'count',label:'触发次数'},{key:'uv',label:'触发人数'},{key:'averageCount',label:'人均次数',render:row=>number(row.averageCount)?.toFixed(2)||'—'}]}/>:<p className="dense-empty">选择事件查看参数统计。</p>}</DensePanel></>;
}
