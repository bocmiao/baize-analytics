import {useEffect,useState} from 'react';
import {rows,type Row,type Site} from './api';
import {DensePanel,LiveStrip,useReportRead} from './DensePrimitives';
import {labelText,metricText} from './trafficModel';
import {downloadReport} from './reportDownload';
import {visitColumns,visitReportQuery,visitorHistoryQuery,type VisitColumn} from './visitReportModel';

export interface VisitsReportProps {site:Site;query:string;refresh:number;ipKey?:string;dimension?:string;label?:string;visitorKey?:string;showLive?:boolean;historyEnabled?:boolean}
export function visitTime(value:unknown,timezone:string){const date=new Date(typeof value==='number'?value:String(value));return Number.isFinite(+date)?new Intl.DateTimeFormat('zh-CN',{timeZone:timezone,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date):'—';}
export function ReportReadStatus({data}:{data:Row|undefined}){return data?.coverage!==undefined&&data.coverage!==1?<p className="dense-info" role="status">所选期间的访问明细不完整，请缩小日期范围。</p>:data?.sessionStatus==='partial_session_context'?<p className="dense-info" role="status">会话起点超出保留范围，暂不显示不完整的访问路径。</p>:null;}
export function VisitPaths({record,timezone}:{record:Row;timezone:string}){return <><h3>本次访问路径</h3><ol>{rows(record.paths).map((path,index)=><li key={index}><time>{visitTime(path.time,timezone)}</time><span>{String(path.path)}</span>{Boolean(path.ipLabel)&&<small>{String(path.ipLabel)}</small>}</li>)}</ol></>;}
export function VisitsReport(props:VisitsReportProps){return <VisitReportBody key={[props.site.id,props.ipKey,props.dimension,props.label,props.visitorKey].join(':')} {...props}/>;}
function VisitReportBody({site,query,refresh,ipKey,dimension,label,visitorKey,showLive=true,historyEnabled=true}:VisitsReportProps){
 const [draft,setDraft]=useState<Record<string,string>>({}),[filters,setFilters]=useState<Record<string,string>>({}),[page,setPage]=useState(1),[size,setSize]=useState(20),[sort,setSort]=useState<VisitColumn>('time'),[direction,setDirection]=useState<'asc'|'desc'>('desc');
 const [hidden,setHidden]=useState<string[]>(['country','region','keyword']),[expanded,setExpanded]=useState(''),[history,setHistory]=useState(''),[tick,setTick]=useState(0),[auto,setAuto]=useState(false),[downloading,setDownloading]=useState(false),[downloadError,setDownloadError]=useState('');
 useEffect(()=>{setPage(1);setExpanded('');setHistory('');setDownloadError('');},[query]);
 useEffect(()=>{if(!auto)return;const timer=window.setInterval(()=>{if(!document.hidden)setTick(value=>value+1);},10000);return()=>window.clearInterval(timer);},[auto]);
 const parameters=visitReportQuery(query,{page,size,sort,direction,filters,ipKey,visitorKey,dimension,label}),base=`/api/v1/sites/${site.id}`,result=useReportRead(`${base}/visits?${parameters}`,`${refresh}:${tick}`),data=result.data;
 const visible=visitColumns.filter(([key])=>!hidden.includes(key)),total=typeof data?.total==='number'?data.total:0,pages=Math.max(1,Math.ceil(total/size));
 useEffect(()=>{if(data?.coverage===1&&page>pages)setPage(pages);},[data,page,pages]);
 function chooseSort(key:VisitColumn){setDirection(key===sort&&direction==='desc'?'asc':'desc');setSort(key);setPage(1);setExpanded('');}
 function reset(){setDraft({});setFilters({});setPage(1);setExpanded('');setHistory('');}
 async function download(){setDownloading(true);setDownloadError('');try{await downloadReport(`${base}/visits.csv?${parameters}`,'访问明细.csv');}catch(error){setDownloadError((error as Error).message);}finally{setDownloading(false);}}
 const cell=(record:Row,key:VisitColumn)=>key==='time'?visitTime(record.time,site.timezone):key==='visitorKey'?<button className="dense-text-button" type="button" aria-expanded={expanded===record.id} onClick={()=>setExpanded(expanded===record.id?'':String(record.id))}>{String(record.visitorKey).slice(0,12)}…</button>:key==='visitorType'?<span className={`visitor-tag ${record.visitorType}`}>{labelText(record.visitorType)}</span>:key==='pageviews'||key==='duration'?metricText(record[key],key):labelText(record[key]);
 return <>
  {showLive&&<LiveStrip live={data?.live as Row|undefined}/>} 
  <DensePanel className="visit-filter-panel">
   {(dimension||ipKey||visitorKey)&&<p className="dense-note">{visitorKey?`访客 ${visitorKey} 在所选日期内的全部访问`:dimension?`当前分组：${labelText(label)}`:'当前 IP 的访问记录'}</p>}
   <form className="visit-filters" onSubmit={event=>{event.preventDefault();setFilters({...draft});setPage(1);setExpanded('');setHistory('');}}>
    <label>访客类型<select value={draft.visitorType||''} onChange={event=>setDraft({...draft,visitorType:event.target.value})}><option value="">全部访客</option><option value="new">新访客</option><option value="returning">老访客</option><option value="unknown">未知</option></select></label>
    {([['referrer','来路网站'],['country','国家代码'],['region','省 / 区域'],['city','城市'],['entry','入口页面'],...visitorKey?[]:[['visitorKey','访客标识前缀']],['ipLabel','IP 标识或网段'],['isp','运营商'],['keyword','关键词'],['browser','浏览器']] as string[][]).map(([key,name])=><label key={key}>{name}<input value={draft[key!]||''} onChange={event=>setDraft({...draft,[key!]:event.target.value})} placeholder={key==='country'?'例如 CN':`输入${name}`}/></label>)}
    <div className="visit-filter-actions"><button type="submit">查询</button><button className="secondary" type="button" onClick={reset}>重置筛选</button></div>
   </form>
  </DensePanel>
  <DensePanel title="访问记录" action={<div className="directory-actions"><label className="checkbox"><input type="checkbox" checked={auto} onChange={event=>setAuto(event.target.checked)}/>每 10 秒刷新</label><button className="secondary" type="button" onClick={()=>setTick(value=>value+1)}>刷新</button></div>}>
   <div className="dense-table-tools"><details className="dense-column-picker"><summary>⚙ 自定义表头</summary><div>{visitColumns.map(([key,name],index)=><label key={key}><input type="checkbox" checked={!hidden.includes(key)} disabled={index<2} onChange={event=>setHidden(event.target.checked?hidden.filter(value=>value!==key):[...hidden,key])}/>{name}</label>)}</div></details><div className="dense-table-actions"><span className="dense-note">列标题可排序；点击访客标识展开路径</span><button className="secondary" type="button" disabled={downloading||data?.coverage!==1} onClick={()=>void download()}>{downloading?'下载中…':'下载全部筛选结果'}</button></div></div>
   <p className="dense-note">下载包含所有匹配记录，每次最多 10,000 条；超限时请缩小范围。搜索和排序对全部匹配记录生效。</p>
   {downloadError&&<p className="error" role="alert">{downloadError}</p>}
   {result.error?<p className="error" role="alert">{result.error}</p>:!data?<p className="dense-empty" role="status">正在读取访问记录…</p>:<>
    <ReportReadStatus data={data}/>
    <div className="table-wrap dense-table-wrap" tabIndex={0} role="region" aria-label="访问明细表"><table className="visit-table"><thead><tr>{visible.map(([key,name])=><th key={key} aria-sort={sort===key?direction==='asc'?'ascending':'descending':'none'}><button className="table-sort" type="button" onClick={()=>chooseSort(key)}>{name}<span aria-hidden="true">{sort===key?(direction==='asc'?' ▴':' ▾'):''}</span></button></th>)}</tr></thead><tbody>{rows(data.rows).map(record=><VisitRecord key={String(record.id)} record={record} visible={visible} expanded={expanded===record.id} cell={cell} timezone={site.timezone} onHistory={historyEnabled?()=>setHistory(String(record.visitorKey)):undefined}/>)}</tbody></table>{data.coverage===1&&!rows(data.rows).length&&<p className="dense-empty">没有符合条件的访问记录</p>}</div>
    <div className="dense-pagination"><span>共 {metricText(data.total)} 条</span><select aria-label="访问明细每页条数" value={size} onChange={event=>{setSize(Number(event.target.value));setPage(1);setExpanded('');}}>{[10,20,50,100].map(value=><option key={value} value={value}>{value} 条/页</option>)}</select><button className="secondary" type="button" disabled={data.coverage!==1||page<=1} onClick={()=>{setPage(page-1);setExpanded('');}}>上一页</button><span>{page} / {pages}</span><button className="secondary" type="button" disabled={data.coverage!==1||page>=pages} onClick={()=>{setPage(page+1);setExpanded('');}}>下一页</button></div>
   </>}
  </DensePanel>
  {history&&<><DensePanel title="访客历史" action={<button type="button" className="secondary" onClick={()=>setHistory('')}>关闭访客历史</button>}><p className="dense-note">查看该访客在所选日期内的所有会话，不受上方来源、页面和地域筛选限制。</p></DensePanel><VisitsReport site={site} query={visitorHistoryQuery(query)} refresh={refresh} visitorKey={history} showLive={false} historyEnabled={false}/></>}
 </>;
}
function VisitRecord({record,visible,expanded,cell,timezone,onHistory}:{record:Row;visible:ReadonlyArray<readonly [VisitColumn,string]>;expanded:boolean;cell:(record:Row,key:VisitColumn)=>React.ReactNode;timezone:string;onHistory?:()=>void}){return <><tr>{visible.map(([key])=><td key={key} title={String(record[key]??'')}>{cell(record,key)}</td>)}</tr>{expanded&&<tr className="visit-expanded"><td colSpan={visible.length}><p>访客标识：{String(record.visitorKey)}</p><VisitPaths record={record} timezone={timezone}/>{onHistory&&<button className="secondary" type="button" onClick={onHistory}>查看该访客的其他访问</button>}</td></tr>}</>;}

