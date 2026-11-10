import type {Row} from './api';
import {language} from './i18n';

const fields:Record<string,string[]>={
 shares:['id','revoked','expires_at','frame_origins','created_at'],tokens:['id','name','scopes','revoked','expires_at','last_used_at','created_at'],
 reports:['name','created_at','updated_at'],goals:['name','event_name','event','path','created_at'],
 funnels:['name','created_at'],exports:['format','status','created_at','completed_at','error'],
 alerts:['id','kind','config','channel_id','silenced_until','last_fired','created_at'],channels:['id','name','kind','enabled','created_at'],
 schedules:['id','name','cadence','report_id','channel_id','enabled','next_at'],audit:['created_at','action','actor_email','actor_id','target'],
};
export function customerRecords(rows:Row[],report:string):Row[]{
 const keys=fields[report];if(!keys)return rows;
 const present=keys.filter(key=>rows.some(row=>row[key]!==undefined));
 return rows.map(row=>Object.fromEntries(present.map(key=>[key,row[key]])));
}
export function JobStatus({data,onRetry}:{data:Row;onRetry:()=>void}){
 const en=language()==='en',aggregation=(data.aggregation||{}) as Row;
 const known=aggregation.generation!=null&&aggregation.processed_generation!=null;
 const failed=Boolean(aggregation.dead_letter_at||aggregation.last_error);
 const pending=Number(aggregation.generation??0)>Number(aggregation.processed_generation??0);
 const queue=Array.isArray(data.outbox)?data.outbox as Row[]:[];
 return <section className="panel settings-panel"><h2>{en?'Data processing':'数据处理'}</h2>
  <dl className="product-facts"><div><dt>{en?'Status':'处理状态'}</dt><dd className={failed?'error':''}>{!known?(en?'No processing record':'暂无处理记录'):failed?(en?'Needs attention':'需要处理'):pending?(en?'Processing':'处理中'):(en?'Up to date':'已完成')}</dd></div><div><dt>{en?'Last processed':'最近处理'}</dt><dd>{aggregation.watermark?new Date(String(aggregation.watermark)).toLocaleString(en?'en-US':'zh-CN'):'—'}</dd></div></dl>
  {failed&&<div className="settings-feedback"><p>{en?'Retry the failed processing task.':'重新处理失败任务。'}</p><button onClick={onRetry}>{en?'Retry processing':'重试处理'}</button></div>}
  <details className="settings-advanced"><summary>{en?'Queue details':'队列详情'}</summary><dl className="product-facts">{queue.map(row=><div key={String(row.status)}><dt>{({pending:en?'Pending':'待处理',running:en?'Running':'处理中',complete:en?'Completed':'已完成',delivered:en?'Delivered':'已发送',failed:en?'Failed':'失败'} as Record<string,string>)[String(row.status)]||String(row.status)}</dt><dd>{String(row.count??0)}</dd></div>)}</dl><details><summary>{en?'Diagnostic details':'诊断详情'}</summary><pre>{JSON.stringify(data,null,2)}</pre></details></details>
 </section>;
}
