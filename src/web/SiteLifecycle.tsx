import {customerText as c} from './customerCopy';
import {useState} from 'react';
import {api,rows,type Row,type Site} from './api';
import {useReportRead} from './DensePrimitives';

export function SiteInstallationCheck({site}:{site:Site}){
 const [url,setUrl]=useState(`https://${site.domain}/`),[busy,setBusy]=useState(false),[result,setResult]=useState<Row>(),[error,setError]=useState('');
 return <section className="panel"><h2>{c("检查追踪代码")}</h2><form onSubmit={async event=>{event.preventDefault();setBusy(true);setResult(undefined);setError('');try{setResult(await api(`/api/v1/sites/${site.id}/installation-check`,{url}));}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}><label>{c("网站页面（HTTPS）")}<input type="url" required value={url} onChange={e=>setUrl(e.target.value)}/></label><button disabled={busy}>{busy?c('正在检查…'):c('检查代码')}</button></form>{result&&<p role="status">{String(result.message)}</p>}{error&&<p role="alert" className="error">{error}</p>}</section>;
}
export function SiteRemoval({site}:{site:Site}){
 const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <section className="panel"><h2>{c("移除站点")}</h2><p>{c("移入回收站后停止采集，保留历史数据。分享与 API 令牌将撤销，推送计划暂停；恢复后需重新配置。")}</p><form onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{await api(`/api/v1/sites/${site.id}`,{confirmName:name},'DELETE');location.assign('/app?report=sites');}catch(error){setError((error as Error).message);setBusy(false);}}}><label>{c('输入完整站点名称「{name}」',{name:site.name})}<input required autoComplete="off" value={name} onChange={e=>setName(e.target.value)}/></label><button disabled={busy||name!==site.name}>{busy?c('正在移除…'):c('移入回收站')}</button></form>{error&&<p role="alert" className="error">{error}</p>}</section>;
}
export function SiteRecycleBin(){
 const [version,setVersion]=useState(0),[busy,setBusy]=useState(''),[error,setError]=useState(''),result=useReportRead('/api/v1/archived-sites',version);
 return <section className="panel"><h2>{c("站点回收站")}</h2><p>{c("已停止采集，历史数据保留。")}</p>{result.error&&<p role="alert">{result.error}</p>}{rows(result.data?.sites).map(site=><div className="row-card" key={String(site.id)}><span>{String(site.name)} · {String(site.domain)}</span><button type="button" className="secondary" disabled={Boolean(busy)} onClick={async()=>{setBusy(String(site.id));setError('');try{await api(`/api/v1/sites/${site.id}/restore`,{confirmName:site.name});setVersion(value=>value+1);location.assign('/app?report=sites');}catch(error){setError((error as Error).message);}finally{setBusy('');}}}>{busy===site.id?c('正在恢复…'):c('恢复站点')}</button></div>)}{result.data&&!rows(result.data.sites).length&&<p>{c("回收站为空。")}</p>}{error&&<p role="alert" className="error">{error}</p>}</section>;
}
