import {useState} from 'react';
import {api,type Row,type Site} from './api';
const titles={schedules:'推送计划',channels:'通知渠道',alerts:'告警规则'} as const;
const names:Record<string,string>={daily:'每天',weekly:'每周',monthly:'每月',smtp:'电子邮件',wecom:'企业微信',serverchan:'Server酱',webhook:'HTTPS Webhook',traffic:'流量偏离',goal:'目标达成',funnel:'漏斗转化',offline:'无事件',storage:'存储空间',serp:'搜索排名'};
export function GovernanceRecordManagement({site,kind,records,onSaved}:{site:Site;kind:keyof typeof titles;records:Row[];onSaved:()=>void}){
 const [busy,setBusy]=useState(''),[error,setError]=useState('');
 const label=(row:Row)=>String(row.name||names[String(row.kind||row.cadence)]||row.kind||row.cadence||titles[kind]);
 const consequence=kind==='channels'?'关联的推送计划和告警规则一并删除，尚未发送的通知会撤销。':'尚未发送的相关通知会撤销，已有统计数据和发送记录保留。';
 if(!records.length)return null;
 return <section className="panel"><h2>管理{titles[kind]}</h2><p className="hint">{consequence}</p>{records.map(row=><div className="row-card" key={String(row.id)}><div><strong>{label(row)}</strong><small> · {String(row.id).slice(0,8)}</small>{kind==='schedules'&&<p className="hint">报表 {String(row.report_id).slice(0,8)} · 通知渠道 {String(row.channel_id).slice(0,8)}</p>}</div><button type="button" className="secondary" disabled={Boolean(busy)} onClick={async()=>{if(!window.confirm(`删除${titles[kind]}「${label(row)}」？\n站点：${site.name} (${site.domain})\n记录：${String(row.id)}\n${consequence}`))return;setBusy(String(row.id));setError('');try{await api(`/api/v1/sites/${site.id}/${kind}/${row.id}`,undefined,'DELETE');onSaved();}catch(reason){setError((reason as Error).message);}finally{setBusy('');}}}>{busy===row.id?'正在删除…':'删除'}</button></div>)}{error&&<p role="alert" className="error">{error}</p>}</section>;
}
