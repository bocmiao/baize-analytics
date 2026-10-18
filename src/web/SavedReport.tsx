import {useState} from 'react';
import {api} from './api';
import {language} from './i18n';
import {reportDefinitionSchema,reportFilterKeys,type ReportFilters,type ReportDefinition} from '../../packages/contracts/report-definition';
const label=(zh:string,en:string)=>language()==='en'?en:zh;
export type SavedReportRecord={id:string;name:string;dsl:ReportDefinition};
export function SavedReport({siteId,from,to,filters={},reports=[],onSaved}:{siteId:string;from:string;to:string;filters?:ReportFilters;reports?:SavedReportRecord[];onSaved:()=>void}){
 const [editing,setEditing]=useState<SavedReportRecord|null>(null),[error,setError]=useState('');
 const value=editing?.dsl??{from,to,...filters};
 return <details className="panel"><summary>{label('保存与编辑筛选报表','Save and edit filtered reports')}</summary><p>{label('保存全部当前站内条件；多个条件同时匹配。超出明细保留期的细分结果可能不可用。','Save every current internal filter. Conditions match together; filtered periods outside raw retention may be unavailable.')}</p>
 <form key={JSON.stringify([editing?.id,value])} onSubmit={async event=>{event.preventDefault();setError('');const fields=new FormData(event.currentTarget);try{const parsed=reportDefinitionSchema.safeParse({...Object.fromEntries(reportFilterKeys.flatMap(key=>String(fields.get(key)||'').trim()?[[key,String(fields.get(key)).trim()]]:[])),from:String(fields.get('from')),to:String(fields.get('to'))});if(!parsed.success)throw Error(label('请检查时间范围与筛选字段长度。','Check the date range and filter field lengths.'));const definition=parsed.data;await api(`/api/v1/sites/${siteId}/reports${editing?`/${editing.id}`:''}`,{name:String(fields.get('name')),dsl:definition},editing?'PATCH':'POST');setEditing(null);onSaved();}catch(caught){setError(caught instanceof Error?caught.message:String(caught));}}}>
 <label>{label('报表名称','Report name')}<input name="name" required maxLength={120} defaultValue={editing?.name??''}/></label>
 <label>{label('开始（ISO 时间）','From (ISO timestamp)')}<input name="from" required defaultValue={value.from}/></label><label>{label('结束（ISO 时间）','To (ISO timestamp)')}<input name="to" required defaultValue={value.to}/></label>
 {reportFilterKeys.map(key=><label key={key}>{key==='path'?label('精确页面路径','Exact page path'):key==='channel'?label('渠道','Channel'):key}<input name={key} maxLength={key==='path'?1024:key==='channel'?100:500} defaultValue={value[key]??''}/></label>)}
 <button>{editing?label('更新报表','Update report'):label('保存筛选报表','Save filtered report')}</button>{editing&&<button type="button" className="secondary" onClick={()=>setEditing(null)}>{label('取消编辑','Cancel editing')}</button>}</form>
 {reports.length>0&&<div><h3>{label('已有报表','Saved reports')}</h3>{reports.map(report=><p key={report.id}>{report.name} <button type="button" className="secondary" onClick={()=>{setError('');setEditing(report);}}>{label('编辑报表','Edit report')}</button></p>)}</div>}{error&&<p role="alert" className="error">{error}</p>}</details>;
}
