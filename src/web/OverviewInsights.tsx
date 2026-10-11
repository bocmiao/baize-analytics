import type {MouseEvent} from 'react';
import {language} from './i18n';
import {rows,type Row} from './api';
export interface OverviewInsight {title:string;detail:string;report:string}
const number=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
/** Descriptive facts from the returned scope only; no causal claims or model calls. */
export function overviewInsights(data:Row):OverviewInsight[]{
 const en=language()==='en',totals=(data.totals||{}) as Row,items:OverviewInsight[]=[];
 const source=rows(data.sources).filter(row=>number(row.pv)).sort((a,b)=>(b.pv as number)-(a.pv as number))[0];
 if(source&&number(totals.pv)&&totals.pv>0)items.push({title:en?'Leading traffic source':'主要流量来源',detail:en?`${String(source.channel)} contributed ${source.pv} pageviews (${((source.pv as number)/totals.pv*100).toFixed(1)}% of this scope).`:`${String(source.channel)}贡献 ${source.pv} 次浏览，占当前范围的 ${((source.pv as number)/totals.pv*100).toFixed(1)}%。`,report:'sources'});
 const page=rows(data.pages).filter(row=>number(row.pv)).sort((a,b)=>(b.pv as number)-(a.pv as number))[0];
 if(page)items.push({title:en?'Most viewed content':'访问最多的内容',detail:en?`${String(page.path)} received ${page.pv} pageviews in this scope.`:`${String(page.path)}在当前范围收到 ${page.pv} 次浏览。`,report:'pages'});
 if(number(totals.conversions)&&!(data.coverage!==1&&totals.conversions===0))items.push({title:en?'Observed goal completions':'已观测目标完成',detail:en?`${totals.conversions} goal completions were returned. Review definitions and attribution before interpreting them as business outcomes.`:`返回 ${totals.conversions} 次目标完成。请结合目标定义与归因复核业务含义。`,report:'goals'});
 return items;
}
export function OverviewInsights({data,reportHref,onReport,canAdmin=false}:{canAdmin?:boolean;data:Row;reportHref:(report:string)=>string;onReport:(report:string)=>void}){
 const en=language()==='en',items=overviewInsights(data);
 const link=(report:string,label:string)=><a href={reportHref(report)} onClick={(event:MouseEvent<HTMLAnchorElement>)=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onReport(report);}}>{label}</a>;
 return <><nav className="overview-insight-tabs" aria-label={en?'Insight destinations':'洞察入口'}><span aria-current="page">{en?'Insights':'洞察'}</span>{canAdmin&&link('seo','SEO')}{link('ai','AI')}</nav><section><div className="panel-heading"><h2>{en?'Key observations':'关键洞察'}</h2>{canAdmin&&link('suggestions',en?'Evidence reports':'证据报告')}</div>{data.coverage!==1&&<p className="overview-insight-note">{en?'Partial data: these observations describe only returned records.':'部分数据：以下观察仅描述已返回记录。'}</p>}{items.length?items.map(item=><article className="overview-insight-item" key={item.report}><h3>{item.title}</h3><p>{item.detail}</p>{link(item.report,en?'View evidence':'查看证据')}</article>):<p className="empty">{en?'No usable observations for this scope. Open a report to inspect coverage.':'当前范围尚无可用观察，请打开报告检查覆盖情况。'}</p>}</section>{canAdmin&&<section className="overview-insight-followup"><h2>{en?'Continue your analysis':'继续分析'}</h2><p>{en?'Review the evidence before deciding what to change.':'先复核证据，再决定是否调整。'}</p>{link('seo',en?'Inspect SEO reports':'查看 SEO 报告')}{link('suggestions',en?'Review evidence suggestions':'查看证据建议')}</section>}<section className="overview-insight-followup"><h2>{en?'AI data assistant':'AI 数据助手'}</h2><p>{en?'Open the assistant to ask a question explicitly. This overview does not call a model.':'前往助手后主动提问。本页不会自动调用模型。'}</p>{link('ai',en?'Open AI assistant':'打开 AI 助手')}</section></>;
}
