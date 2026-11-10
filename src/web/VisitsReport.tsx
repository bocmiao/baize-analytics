import {customerText as c,language} from './customerCopy';
import {useEffect,useId,useState} from 'react';
import {rows,type Row,type Site} from './api';
import {DensePanel,LiveStrip,ReportIcon,useReportRead} from './DensePrimitives';
import {labelText,metricText} from './trafficModel';
import {downloadReport} from './reportDownload';
import {visitColumns,visitReportQuery,visitorHistoryQuery,type VisitColumn} from './visitReportModel';

export interface VisitsReportProps {site:Site;query:string;refresh:number;ipKey?:string;dimension?:string;label?:string;visitorKey?:string;showLive?:boolean;historyEnabled?:boolean}
export function visitTime(value:unknown,timezone:string){const date=new Date(typeof value==='number'?value:String(value));return Number.isFinite(+date)?new Intl.DateTimeFormat(language(),{timeZone:timezone,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date):'—';}
export function ReportReadStatus({data}:{data:Row|undefined}){return data?.coverage!==undefined&&data.coverage!==1?<p className="dense-info" role="status">{c("部分记录不可用，请缩小日期范围。")}</p>:data?.sessionStatus==='partial_session_context'?<p className="dense-info" role="status">{c("访问起点已超出保留期，无法显示完整路径。")}</p>:null;}
export function VisitPaths({record,timezone}:{record:Row;timezone:string}){return <><h3>{c("本次访问路径")}</h3><ol className="visit-path-list">{rows(record.paths).map((path,index)=><li key={index}><time>{visitTime(path.time,timezone)}</time><span>{String(path.path)}</span>{Boolean(path.ipLabel)&&<small>{String(path.ipLabel)}</small>}</li>)}</ol></>;}
export function VisitsReport(props:VisitsReportProps){return <VisitReportBody key={[props.site.id,props.ipKey,props.dimension,props.label,props.visitorKey].join(':')} {...props}/>;}
function VisitReportBody({site,query,refresh,ipKey,dimension,label,visitorKey,showLive=true,historyEnabled=true}:VisitsReportProps){
 const filterPanelId=useId(),[filtersOpen,setFiltersOpen]=useState(()=>{const scope=new URLSearchParams(query);return ['visitorType','referrer','country','region','city','entry','visitorKey','ipLabel','isp','keyword','browser'].some(key=>Boolean(scope.get(key)?.trim()));});
 const [draft,setDraft]=useState<Record<string,string>>({}),[filters,setFilters]=useState<Record<string,string>>({}),[page,setPage]=useState(1),[size,setSize]=useState(20),[sort,setSort]=useState<VisitColumn>('time'),[direction,setDirection]=useState<'asc'|'desc'>('desc');
 const [hidden,setHidden]=useState<string[]>(['country','region','keyword']),[expanded,setExpanded]=useState(''),[history,setHistory]=useState(''),[tick,setTick]=useState(0),[auto,setAuto]=useState(false),[downloading,setDownloading]=useState(false),[downloadError,setDownloadError]=useState('');
 useEffect(()=>{setPage(1);setExpanded('');setHistory('');setDownloadError('');},[query]);
 useEffect(()=>{if(!auto)return;const timer=window.setInterval(()=>{if(!document.hidden)setTick(value=>value+1);},10000);return()=>window.clearInterval(timer);},[auto]);
 const parameters=visitReportQuery(query,{page,size,sort,direction,filters,ipKey,visitorKey,dimension,label}),base=`/api/v1/sites/${site.id}`,result=useReportRead(`${base}/visits?${parameters}`,`${refresh}:${tick}`),data=result.data;
 const appliedParameters=new URLSearchParams(parameters),activeFilterNames=([['visitorType',c('访客类型')],['referrer',c('来路网站')],['country',c('国家')],['region',c('省 / 区域')],['city',c('城市')],['entry',c('入口页面')],['visitorKey',c('访客标识')],['ipLabel',c('IP 标识或网段')],['isp',c('运营商')],['keyword',c('关键词')],['browser',c('浏览器')],['ipKey',c('指定 IP')],['visitDimension',c('当前分组')]] as const).filter(([key])=>appliedParameters.get(key)?.trim()).map(([,name])=>name);
 const visible=visitColumns.filter(([key])=>!hidden.includes(key)),total=typeof data?.total==='number'?data.total:0,pages=Math.max(1,Math.ceil(total/size));
 useEffect(()=>{if(data?.coverage===1&&page>pages)setPage(pages);},[data,page,pages]);
 function chooseSort(key:VisitColumn){setDirection(key===sort&&direction==='desc'?'asc':'desc');setSort(key);setPage(1);setExpanded('');}
 function reset(){setDraft({});setFilters({});setPage(1);setExpanded('');setHistory('');}
 async function download(){setDownloading(true);setDownloadError('');try{await downloadReport(`${base}/visits.csv?${parameters}`,c('访问明细.csv'));}catch(error){setDownloadError((error as Error).message);}finally{setDownloading(false);}}
 const cell=(record:Row,key:VisitColumn)=>key==='time'?visitTime(record.time,site.timezone):key==='visitorKey'?<button className="dense-text-button" type="button" aria-expanded={expanded===record.id} onClick={()=>setExpanded(expanded===record.id?'':String(record.id))}>{String(record.visitorKey).slice(0,12)}…</button>:key==='visitorType'?<span className={`visitor-tag ${record.visitorType}`}>{c(labelText(record.visitorType))}</span>:key==='pageviews'||key==='duration'?metricText(record[key],key):c(labelText(record[key]));
 return <>
  {showLive&&<LiveStrip live={data?.live as Row|undefined}/>} 
  <DensePanel className="visit-filter-panel">
   <button className="secondary" type="button" aria-expanded={filtersOpen} aria-controls={filterPanelId} onClick={()=>setFiltersOpen(value=>!value)} style={{width:'100%',minHeight:44,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><span>{c("筛选记录")}{activeFilterNames.length>0&&c(' · {count} 项生效',{count:activeFilterNames.length})}</span><ReportIcon name={filtersOpen?'up':'down'}/></button>
   {activeFilterNames.length>0&&<p className="dense-note" role="status">{c("当前生效：")}{activeFilterNames.join(language()==='en'?', ':'、')}</p>}
   {(dimension||ipKey||visitorKey)&&<p className="dense-note">{visitorKey?c('访客 {visitor} 在所选日期内的全部访问',{visitor:visitorKey}):dimension?c('当前分组：{group}',{group:labelText(label)}):c('当前 IP 的访问记录')}</p>}
   <div id={filterPanelId} hidden={!filtersOpen} style={{marginTop:12}}>
   <form className="visit-filters" onSubmit={event=>{event.preventDefault();setFilters({...draft});setPage(1);setExpanded('');setHistory('');}}>
    <label>{c("访客类型")}<select value={draft.visitorType||''} onChange={event=>setDraft({...draft,visitorType:event.target.value})}><option value="">{c("全部访客")}</option><option value="new">{c("新访客")}</option><option value="returning">{c("老访客")}</option><option value="unknown">{c("未知")}</option></select></label>
    {([['referrer',c('来路网站')],['country',c('国家代码')],['region',c('省 / 区域')],['city',c('城市')],['entry',c('入口页面')],...visitorKey?[]:[['visitorKey',c('访客标识前缀')]],['ipLabel',c('IP 标识或网段')],['isp',c('运营商')],['keyword',c('关键词')],['browser',c('浏览器')]] as string[][]).map(([key,name])=><label key={key}>{c(name!)}<input value={draft[key!]||''} onChange={event=>setDraft({...draft,[key!]:event.target.value})} placeholder={key==='country'?c('例如 CN'):c('输入{name}',{name:name!})}/></label>)}
    <div className="visit-filter-actions"><button type="submit">{c("查询")}</button><button className="secondary" type="button" onClick={reset}>{c("重置筛选")}</button></div>
   </form>
   </div>
  </DensePanel>
  <DensePanel title={c("访问记录")} action={<div className="directory-actions"><label className="checkbox"><input type="checkbox" checked={auto} onChange={event=>setAuto(event.target.checked)}/>{c("每 10 秒刷新")}</label><button className="secondary" type="button" onClick={()=>setTick(value=>value+1)}>{c("刷新")}</button></div>}>
   <div className="dense-table-tools"><details className="dense-column-picker"><summary><ReportIcon name="columns"/>{c("显示列")}</summary><div>{visitColumns.map(([key,name],index)=><label key={key}><input type="checkbox" checked={!hidden.includes(key)} disabled={index<2} onChange={event=>setHidden(event.target.checked?hidden.filter(value=>value!==key):[...hidden,key])}/>{c(name!)}</label>)}</div></details><div className="dense-table-actions"><span className="dense-note">{c("点击访客查看访问路径")}</span><button className="secondary" type="button" title={c("导出全部筛选结果，最多 10,000 条。超限请缩小范围。")} disabled={downloading||data?.coverage!==1} onClick={()=>void download()}><ReportIcon name="download"/>{downloading?c('下载中…'):c('下载全部筛选结果')}</button></div></div>
   <p className="dense-note">{c("导出全部筛选结果，最多 10,000 条。超限请缩小范围。")}</p>
   {downloadError&&<p className="error" role="alert">{downloadError}</p>}
   {result.error?<p className="error" role="alert">{result.error}</p>:!data?<p className="dense-empty" role="status">{c("正在加载…")}</p>:<>
    <ReportReadStatus data={data}/>
    <div className="table-wrap dense-table-wrap" tabIndex={0} role="region" aria-label={c("访问明细表")}><table className="visit-table"><thead><tr>{visible.map(([key,name])=><th key={key} aria-sort={sort===key?direction==='asc'?'ascending':'descending':'none'}><button className="table-sort" type="button" onClick={()=>chooseSort(key)}>{c(name!)}<span aria-hidden="true">{sort===key&&<ReportIcon name={direction==='asc'?'up':'down'}/>}</span></button></th>)}</tr></thead><tbody>{rows(data.rows).map(record=><VisitRecord key={String(record.id)} record={record} visible={visible} expanded={expanded===record.id} cell={cell} timezone={site.timezone} onHistory={historyEnabled?()=>setHistory(String(record.visitorKey)):undefined}/>)}</tbody></table>{data.coverage===1&&!rows(data.rows).length&&<p className="dense-empty">{c("没有匹配的访问记录")}</p>}</div>
    <div className="dense-pagination"><span>{c('共 {count} 条',{count:metricText(data.total)})}</span><select aria-label={c("访问明细每页条数")} value={size} onChange={event=>{setSize(Number(event.target.value));setPage(1);setExpanded('');}}>{[10,20,50,100].map(value=><option key={value} value={value}>{c('{count} 条/页',{count:value})}</option>)}</select><button className="secondary" type="button" disabled={data.coverage!==1||page<=1} onClick={()=>{setPage(page-1);setExpanded('');}}>{c("上一页")}</button><span>{page} / {pages}</span><button className="secondary" type="button" disabled={data.coverage!==1||page>=pages} onClick={()=>{setPage(page+1);setExpanded('');}}>{c("下一页")}</button></div>
   </>}
  </DensePanel>
  {history&&<><div className="report-drill-heading"><h3 title={c("查看同一日期内的全部访问，忽略其他筛选条件。")}>{c("访客历史")}</h3><button type="button" className="secondary" onClick={()=>setHistory('')}>{c("关闭历史")}</button></div><VisitsReport site={site} query={visitorHistoryQuery(query)} refresh={refresh} visitorKey={history} showLive={false} historyEnabled={false}/></>}
 </>;
}
function VisitRecord({record,visible,expanded,cell,timezone,onHistory}:{record:Row;visible:ReadonlyArray<readonly [VisitColumn,string]>;expanded:boolean;cell:(record:Row,key:VisitColumn)=>React.ReactNode;timezone:string;onHistory?:()=>void}){return <><tr>{visible.map(([key])=><td key={key} title={String(record[key]??'')}>{cell(record,key)}</td>)}</tr>{expanded&&<tr className="visit-expanded"><td colSpan={visible.length}><p>{c("访客标识：")}{String(record.visitorKey)}</p><VisitPaths record={record} timezone={timezone}/>{onHistory&&<button className="secondary" type="button" onClick={onHistory}>{c("查看访客历史")}</button>}</td></tr>}</>;}

