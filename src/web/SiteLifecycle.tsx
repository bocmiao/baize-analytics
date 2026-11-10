import {useState} from 'react';
import {api,rows,type Row,type Site} from './api';
import {useReportRead} from './DensePrimitives';

export function SiteInstallationCheck({site}:{site:Site}){
 const [url,setUrl]=useState(`https://${site.domain}/`),[busy,setBusy]=useState(false),[result,setResult]=useState<Row>(),[error,setError]=useState('');
 return <section className="panel"><h2>检查网页安装代码</h2><form onSubmit={async event=>{event.preventDefault();setBusy(true);setResult(undefined);setError('');try{setResult(await api(`/api/v1/sites/${site.id}/installation-check`,{url}));}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}><label>本站 HTTPS 页面<input type="url" required value={url} onChange={e=>setUrl(e.target.value)}/></label><button disabled={busy}>{busy?'正在检查网页…':'检测安装代码'}</button></form>{result&&<p role="status">{String(result.message)}</p>}{error&&<p role="alert" className="error">{error}</p>}</section>;
}
export function SiteRemoval({site}:{site:Site}){
 const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <section className="panel"><h2>移除站点</h2><p>移入回收站后停止采集，保留已有数据。分享链接与 API 令牌会撤销，推送计划暂停。恢复后可重新配置这些入口。</p><form onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{await api(`/api/v1/sites/${site.id}`,{confirmName:name},'DELETE');location.assign('/app?report=sites');}catch(error){setError((error as Error).message);setBusy(false);}}}><label>输入完整站点名称「{site.name}」<input required autoComplete="off" value={name} onChange={e=>setName(e.target.value)}/></label><button disabled={busy||name!==site.name}>{busy?'正在移除…':'移入回收站'}</button></form>{error&&<p role="alert" className="error">{error}</p>}</section>;
}
export function SiteRecycleBin(){
 const [version,setVersion]=useState(0),[busy,setBusy]=useState(''),[error,setError]=useState(''),result=useReportRead('/api/v1/archived-sites',version);
 return <section className="panel"><h2>站点回收站</h2><p>这里的站点已停止采集，历史数据仍保留。</p>{result.error&&<p role="alert">{result.error}</p>}{rows(result.data?.sites).map(site=><div className="row-card" key={String(site.id)}><span>{String(site.name)} · {String(site.domain)}</span><button type="button" className="secondary" disabled={Boolean(busy)} onClick={async()=>{setBusy(String(site.id));setError('');try{await api(`/api/v1/sites/${site.id}/restore`,{confirmName:site.name});setVersion(value=>value+1);location.assign('/app?report=sites');}catch(error){setError((error as Error).message);}finally{setBusy('');}}}>{busy===site.id?'正在恢复…':'恢复站点'}</button></div>)}{result.data&&!rows(result.data.sites).length&&<p>回收站为空。</p>}{error&&<p role="alert" className="error">{error}</p>}</section>;
}
