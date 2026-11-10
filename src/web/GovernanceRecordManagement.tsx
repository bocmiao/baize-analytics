import {customerText as c} from './customerCopy';
import {useState} from 'react';
import {api,type Row,type Site} from './api';
const titles={schedules:c('推送计划'),channels:c('通知渠道'),alerts:c('告警规则')} as const;
const names:Record<string,string>={daily:c('每天'),weekly:c('每周'),monthly:c('每月'),smtp:c('电子邮件'),wecom:c('企业微信'),serverchan:c('Server酱'),webhook:'HTTPS Webhook',traffic:c('流量偏离'),goal:c('目标达成'),funnel:c('漏斗转化'),offline:c('无事件'),storage:c('存储空间'),serp:c('搜索排名')};
export function GovernanceRecordManagement({site,kind,records,onSaved}:{site:Site;kind:keyof typeof titles;records:Row[];onSaved:()=>void}){
 const [busy,setBusy]=useState(''),[error,setError]=useState('');
 const label=(row:Row)=>String(row.name||names[String(row.kind||row.cadence)]||row.kind||row.cadence||titles[kind]);
 const consequence=kind==='channels'?c('同时删除关联计划和告警，并撤销未发送通知。'):c('撤销未发送通知，保留统计与发送记录。');
 if(!records.length)return null;
 return <section className="panel settings-panel"><h2>{c('管理{kind}',{kind:titles[kind]})}</h2>{records.map(row=><div className="row-card settings-record" key={String(row.id)}><div><strong>{label(row)}</strong>{!row.name&&<small> · {String(row.id).slice(0,8)}</small>}{kind==='schedules'&&<p className="hint">{c('报表 {report} · 通知渠道 {channel}',{report:String(row.report_id).slice(0,8),channel:String(row.channel_id).slice(0,8)})}</p>}</div><button type="button" className="secondary" disabled={Boolean(busy)} onClick={async()=>{if(!window.confirm(c('删除{kind}「{name}」？\n站点：{site} ({domain})\n记录：{id}\n{consequence}',{kind:titles[kind],name:label(row),site:site.name,domain:site.domain,id:String(row.id),consequence})))return;setBusy(String(row.id));setError('');try{await api(`/api/v1/sites/${site.id}/${kind}/${row.id}`,undefined,'DELETE');onSaved();}catch(reason){setError((reason as Error).message);}finally{setBusy('');}}}>{busy===row.id?c('正在删除…'):c('删除')}</button></div>)}{error&&<p role="alert" className="error">{error}</p>}</section>;
}
