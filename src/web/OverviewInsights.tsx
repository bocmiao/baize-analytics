import type {MouseEvent} from 'react';
import {language} from './i18n';
import {rows,type Row} from './api';
import {dimensionText} from './dimensionLabels';
export function overviewChannelLabel(value:string){return dimensionText('channel',value);}
export interface OverviewInsight {title:string;detail:string;report:string}
const number=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
/** Descriptive facts from the returned scope only; no causal claims or model calls. */
export function overviewInsights(data:Row):OverviewInsight[]{
 const en=language()==='en',totals=(data.totals||{}) as Row,items:OverviewInsight[]=[];
 const source=rows(data.sources).filter(row=>number(row.pv)).sort((a,b)=>(b.pv as number)-(a.pv as number))[0];
 if(source&&number(totals.pv)&&totals.pv>0){const share=((source.pv as number)/totals.pv*100).toFixed(1),channel=overviewChannelLabel(String(source.channel));items.push({title:en?`${channel}: ${share}% of pageviews`:`${channel}占 ${share}% 浏览量`,detail:en?'Share of pageviews in this range, not visitors.':'这是浏览量占比，不是访客占比。',report:'sources'});}
 const page=rows(data.pages).filter(row=>number(row.pv)).sort((a,b)=>(b.pv as number)-(a.pv as number))[0];
 if(page){const path=dimensionText('path',page.path);items.push({title:en?`${path}: ${page.pv} pageviews`:`${path} ${page.pv} 次浏览`,detail:en?'Pageviews in this range.':'这个范围的浏览量。',report:'pages'});}
 if(number(totals.conversions)&&!(data.coverage!==1&&totals.conversions===0))items.push({title:en?`${totals.conversions} goal completions`:`${totals.conversions} 次目标完成`,detail:en?'Configured goal completions, not paying customers.':'按已配置目标计数，不是付费人数。',report:'goals'});
 return items;
}

function InsightIcon({kind}:{kind:'observation'|'review'|'assistant'}){return <span className={`overview-insight-icon ${kind}`} aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{kind==='observation'?<><path d="M9 18h6M10 21h4M8 14a6 6 0 1 1 8 0l-1 2H9ZM12 1v2M3 5l2 2M21 5l-2 2"/></>:kind==='review'?<><rect x="3" y="3" width="18" height="18" rx="4"/><path d="m7 12 3 3 7-7"/></>:<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>}</svg></span>;}
export function OverviewInsights({data,reportHref,onReport,canAdmin=false,compact=false}:{compact?:boolean;canAdmin?:boolean;data:Row;reportHref:(report:string)=>string;onReport:(report:string)=>void}){
 const en=language()==='en',items=overviewInsights(data);
 const link=(report:string,label:string)=><a href={reportHref(report)} onClick={(event:MouseEvent<HTMLAnchorElement>)=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onReport(report);}}>{label}</a>;
 return <>{!compact&&<nav className="overview-insight-tabs" aria-label={en?'Insight destinations':'洞察入口'}><span aria-current="page">{en?'Insights':'洞察'}</span>{canAdmin&&link('seo','SEO')}{link('ai','AI')}</nav>}<section className={compact?"overview-insight-compact":undefined}><div className="panel-heading"><h2><InsightIcon kind="observation"/>{compact?(en?'At a glance':'本期观察'):(en?'Key observations':'关键洞察')}</h2></div>{data.coverage!==1&&<p className="overview-insight-note">{en?'Partial data: the notes below only cover records that came back.':'部分数据：下面只描述已返回的记录。'}</p>}<div className="overview-insight-list">{items.length?items.map((item,index)=><article className="overview-insight-item" key={item.report}><div className="overview-insight-item-heading"><span className="overview-insight-number" aria-hidden="true">{index+1}</span><h3>{item.title}</h3></div><div className="overview-insight-evidence"><p>{item.detail}</p>{link(item.report,en?'View evidence':'查看证据')}</div></article>):<p className="empty">{en?'No observation for this range.':'这个范围还没有观察。'}</p>}</div></section>{!compact&&canAdmin&&<section className="overview-insight-followup"><h2><InsightIcon kind="review"/>{en?'Continue your analysis':'继续分析'}</h2><p>{en?'Look at the evidence first.':'先看证据。'}</p>{link('seo',en?'Inspect SEO reports':'查看 SEO 报告')}{link('suggestions',en?'Review evidence suggestions':'查看证据建议')}</section>}{!compact&&<section className="overview-insight-followup"><h2><InsightIcon kind="assistant"/>{en?'AI data assistant':'AI 数据助手'}</h2><p>{en?'Ask on the AI page. Overview does not call a model.':'去问数页提问。总览不调用模型。'}</p>{link('ai',en?'Open AI assistant':'打开 AI 助手')}</section>}</>;
}
