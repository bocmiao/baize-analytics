import {useState} from 'react';
import {ownValue} from './dictionary';
import {language,t} from './i18n';
import {rows,type Row} from './api';
import {dimensionText} from './dimensionLabels';

import {minuteBuckets,realtimeTimestamp} from './realtimeTime';

export function RealtimeSummary({data,timezone,paused=false,onTogglePause}:{data:Row;timezone?:string;paused?:boolean;onTogglePause?:()=>void}) {
 const metadata=(data.realtime||{}) as Row;
 const complete=metadata.status==='complete'&&metadata.coverage===1;
 const labels:Record<string,string>={path:t('页面'),channel:t('渠道'),referrer:t('来源'),country:t('国家'),region:t('区域'),city:t('城市'),pv:t('浏览量'),uv:t('访客')};
 const events=[...rows(data.events)].sort((left,right)=>(realtimeTimestamp(right.ts)??0)-(realtimeTimestamp(left.ts)??0));
 const buckets=minuteBuckets(events);
 const peak=Math.max(1,...buckets.map(bucket=>bucket.count));
 const en=language()==='en';
 const online=typeof data.online==='number'&&data.onlineCoverage===1?data.online.toLocaleString(en?'en-US':'zh-CN'):'—';
 const clock=(value:unknown)=>{const ts=realtimeTimestamp(value);return ts!==null?new Date(ts).toLocaleTimeString(en?'en':'zh-CN',{timeZone:timezone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}):'—';};
 const [feed,setFeed]=useState<'all'|'pageview'|'event'>('all');
 const pageCounts=new Map<string,number>();
 for(const event of events){const path=String(event.path||'');if(!path)continue;pageCounts.set(path,(pageCounts.get(path)||0)+1);}
 const currentPages=[...pageCounts.entries()].sort((left,right)=>right[1]-left[1]).slice(0,6);
 const shown=events.filter(event=>{const type=String(event.type||'');if(feed==='pageview')return type==='pageview';if(feed==='event')return type!=='pageview'&&type!=='heartbeat';return true;});
 const pageMax=Math.max(1,...currentPages.map(([,count])=>count));
 return <>
  <section className="panel realtime-stage" aria-label={en?'Live pulse':'实时脉冲'}>
   <div className="realtime-side">
    <div className="realtime-online"><span className="overview-live-dot" aria-hidden="true"/><div><span>{en?'Active in the last 5 minutes':'近 5 分钟活跃'}</span><strong className="livecount">{online}</strong><small>{en?'Heartbeat-deduped visitors':'心跳去重访客'}</small></div></div>
    <div><h3>{en?'Minutes in this preview':'这次预览的分钟柱'}</h3><p className="hint">{en?'Bars count only the latest events in this realtime response. They are not complete 30-minute traffic.':'分钟柱只统计本次接口返回的最近事件，不是完整 30 分钟流量。'}</p>{buckets.length?<div className="minute-bars" aria-hidden="true">{buckets.map(bucket=><i key={bucket.index} style={{height:`${Math.max(bucket.count?6:2,bucket.count/peak*100)}%`}}/>)}</div>:<p className="empty">{en?'No recent events were returned.':'没有返回最近事件。'}</p>}</div>
    <div><h3>{en?'Pages being visited':'正在访问的页面'}</h3>{currentPages.length?<ul className="rank-rows">{currentPages.map(([path,count])=><li key={path}><span className="bar-bg" style={{width:`${count/pageMax*92}%`}} aria-hidden="true"/><span className="k">{path}</span><b>{count.toLocaleString(en?'en-US':'zh-CN')}</b></li>)}</ul>:<p className="empty">{en?'No page paths in this preview.':'这次预览没有页面路径。'}</p>}</div>
   </div>
   <div className="realtime-feed"><div className="realtime-feed-tools"><h3>{en?'Live event stream':'实时事件流'}</h3><div className="overview-page-order mini-tabs" role="group" aria-label={en?'Event stream filter':'事件流筛选'}><button type="button" aria-pressed={feed==='all'} onClick={()=>setFeed('all')}>{en?'All':'全部'}</button><button type="button" aria-pressed={feed==='pageview'} onClick={()=>setFeed('pageview')}>{en?'Pageviews':'浏览'}</button><button type="button" aria-pressed={feed==='event'} onClick={()=>setFeed('event')}>{en?'Events':'事件'}</button></div>{onTogglePause&&<button type="button" className="secondary" aria-pressed={paused} onClick={onTogglePause}>{paused?(en?'Resume':'继续'):(en?'Pause':'暂停')}</button>}</div>{shown.length?<ol className="visit-stream">{shown.slice(0,12).map((event,index)=>{const dimensions=event.dimensions&&typeof event.dimensions==='object'&&!Array.isArray(event.dimensions)?event.dimensions as Row:{};const device=typeof dimensions.device==='string'?dimensions.device:'';const country=typeof dimensions.country==='string'?dimensions.country:'';return <li key={String(event.event_id||index)}><time>{clock(event.ts)}</time><span>{String(event.path||event.type||'—')}</span><small>{String(event.type||'')}</small>{device&&<b className="visit-device">{dimensionText('device',device)}</b>}{country&&<b className="visit-country">{dimensionText('country',country)}</b>}</li>;})}</ol>:<p className="empty">{en?'The visit stream is empty.':'访问流是空的。'}</p>}</div>
  </section>
  <section className="panel"><h3>{t('实时完整窗口汇总')}</h3><p>{t('近 5 分钟活跃：')}{online}</p><dl className="prop-list"><div><dt>{t('最近30分钟浏览量')}</dt><dd><strong data-testid="realtime-total">{complete?String(metadata.pv):'—'}</strong></dd></div><div><dt>{t('覆盖率')}</dt><dd>{Math.round(Number(metadata.coverage||0)*100)}%</dd></div><div><dt>{en?'Window':'窗口'}</dt><dd>{String(metadata.from||'—')} — {String(metadata.to||'—')}</dd></div></dl><p className="hint">{t('下方是最近 200 条事件。Top 用完整窗口。')}</p>{!complete&&<p className="notice">{t('实时窗口不完整，Top 暂无。')}</p>}{[['topPages','实时Top页面'],['topSources','实时Top来源'],['topGeography','实时Top地域']].map(([key,title])=><section className="dim-card" key={key} aria-label={t(title)}><h4>{t(title)}</h4>{complete&&Array.isArray(data[key])?<div className="table-wrap" tabIndex={0} role="region" aria-label={t(title)}><table><thead><tr>{Object.keys((data[key] as Row[])[0]||{}).map(column=><th key={column}>{ownValue(labels,column)||column}</th>)}</tr></thead><tbody>{(data[key] as Row[]).map((row,index)=><tr key={index}>{Object.entries(row).map(([field,value])=><td key={field}>{value===null?'—':['country','region','city','device','channel','source'].includes(field)?dimensionText(field,value):String(value)}</td>)}</tr>)}</tbody></table></div>:<p>—</p>}</section>)}</section>
 </>;
}
