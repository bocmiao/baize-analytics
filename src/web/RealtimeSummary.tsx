import {ownValue} from './dictionary';
import {language,t} from './i18n';
import {rows,type Row} from './api';

import {minuteBuckets,realtimeTimestamp} from './realtimeTime';

export function RealtimeSummary({data,timezone}:{data:Row;timezone?:string}) {
 const metadata=(data.realtime||{}) as Row;
 const complete=metadata.status==='complete'&&metadata.coverage===1;
 const labels:Record<string,string>={path:t('页面'),channel:t('渠道'),referrer:t('来源'),country:t('国家'),region:t('区域'),city:t('城市'),pv:t('浏览量'),uv:t('访客')};
 const events=[...rows(data.events)].sort((left,right)=>(realtimeTimestamp(right.ts)??0)-(realtimeTimestamp(left.ts)??0));
 const buckets=minuteBuckets(events);
 const peak=Math.max(1,...buckets.map(bucket=>bucket.count));
 const en=language()==='en';
 const online=typeof data.online==='number'&&data.onlineCoverage===1?data.online.toLocaleString(en?'en-US':'zh-CN'):'—';
 const clock=(value:unknown)=>{const ts=realtimeTimestamp(value);return ts!==null?new Date(ts).toLocaleTimeString(en?'en':'zh-CN',{timeZone:timezone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}):'—';};
 return <>
  <section className="panel realtime-stage" aria-label={en?'Live pulse':'实时脉冲'}>
   <div className="realtime-online"><span className="overview-live-dot" aria-hidden="true"/><div><span>{en?'Active in the last 5 minutes':'近 5 分钟活跃'}</span><strong className="livecount">{online}</strong></div></div>
   <div><h3>{en?'Minutes in this preview':'这次预览的分钟柱'}</h3><p className="hint">{en?'Bars count only the latest events in this realtime response. They are not complete 30-minute traffic.':'分钟柱只统计本次接口返回的最近事件，不是完整 30 分钟流量。'}</p>{buckets.length?<div className="minute-bars" aria-hidden="true">{buckets.map(bucket=><i key={bucket.index} style={{height:`${Math.max(bucket.count?6:2,bucket.count/peak*100)}%`}}/>)}</div>:<p className="empty">{en?'No recent events were returned.':'没有返回最近事件。'}</p>}</div>
   <div><h3>{en?'Recent visits':'最近访问'}</h3>{events.length?<ol className="visit-stream">{events.slice(0,12).map((event,index)=><li key={String(event.event_id||index)}><time>{clock(event.ts)}</time><span>{String(event.path||event.type||'—')}</span><small>{String(event.type||'')}</small></li>)}</ol>:<p className="empty">{en?'The visit stream is empty.':'访问流是空的。'}</p>}</div>
  </section>
  <section className="panel"><h3>{t('实时完整窗口汇总')}</h3><p>{t('近 5 分钟活跃：')}{online}</p><p>{t('最近30分钟浏览量')}：<strong data-testid="realtime-total">{complete?String(metadata.pv):'—'}</strong> · {t('覆盖率')}：{Math.round(Number(metadata.coverage||0)*100)}%</p><p>{String(metadata.from||'—')} — {String(metadata.to||'—')}</p><p>{t('下方事件仅为最近200条预览，不能作为完整流量或Top统计。')}</p>{!complete&&<p className="notice">{t('实时窗口不完整，Top不可用，不显示伪零值。')}</p>}{[['topPages','实时Top页面'],['topSources','实时Top来源'],['topGeography','实时Top地域']].map(([key,title])=><section key={key} aria-label={t(title)}><h4>{t(title)}</h4>{complete&&Array.isArray(data[key])?<div className="table-wrap"><table><thead><tr>{Object.keys((data[key] as Row[])[0]||{}).map(key=><th key={key}>{ownValue(labels,key)||key}</th>)}</tr></thead><tbody>{(data[key] as Row[]).map((row,index)=><tr key={index}>{Object.values(row).map((value,index)=><td key={index}>{value===null?'—':String(value)}</td>)}</tr>)}</tbody></table></div>:<p>—</p>}</section>)}</section>
 </>;
}
