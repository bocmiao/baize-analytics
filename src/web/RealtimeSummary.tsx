import {ownValue} from './dictionary';
import {language,t} from './i18n';
import {rows,type Row,type Site} from './api';

import {minuteBuckets,realtimeTimestamp} from './realtimeTime';

const channelLabels:Record<string,string>={direct:'直接访问',search:'自然搜索',referral:'外部网站',social:'社交网络',email:'邮件',paid:'付费推广',internal:'站内跳转',unknown:'未知'};
const deviceLabels:Record<string,string>={desktop:'电脑',mobile:'手机',tablet:'平板',unknown:'未知'};
const geoLabels:Record<string,string>={unknown:'未知'};
const eventLabels:Record<string,string>={pageview:'页面浏览',heartbeat:'停留心跳',custom:'自定义事件',click:'点击',outbound:'外链点击',form:'表单提交'};

function humanize(dimension:string, value:unknown, en:boolean) {
 const text = String(value);
 if (en) return text;
 if (dimension === 'channel' || dimension === 'channel_group') return channelLabels[text] || text;
 if (dimension === 'device') return deviceLabels[text] || text;
 if (dimension === 'country' || dimension === 'region' || dimension === 'city') return geoLabels[text] || text;
 return text;
}

export function RealtimeSummary({data,timezone,site}:{data:Row;timezone?:string;site?:Site}) {
 const metadata=(data.realtime||{}) as Row;
 const complete=metadata.status==='complete'&&metadata.coverage===1;
 const labels:Record<string,string>={path:t('页面'),channel:t('渠道'),referrer:t('来源'),country:t('国家'),region:t('区域'),city:t('城市'),pv:t('浏览量'),uv:t('访客')};
 const events=[...rows(data.events)].sort((left,right)=>(realtimeTimestamp(right.ts)??0)-(realtimeTimestamp(left.ts)??0));
 const buckets=minuteBuckets(events);
 const peak=Math.max(1,...buckets.map(bucket=>bucket.count));
 const en=language()==='en';
 const online=typeof data.online==='number'&&data.onlineCoverage===1?data.online.toLocaleString(en?'en-US':'zh-CN'):'—';
 const clock=(value:unknown)=>{const ts=realtimeTimestamp(value);return ts!==null?new Date(ts).toLocaleTimeString(en?'en':'zh-CN',{timeZone:timezone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}):'—';};
 // 窗口时间按站点时区显示，不能把 UTC 的 ISO 串直接打到界面上。
 const stamp=(value:unknown)=>{const ts=realtimeTimestamp(value);if(ts===null)return '—';return new Intl.DateTimeFormat(en?'en-GB':'zh-CN',{timeZone:timezone,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(ts));};
 const origin=site?.domain?(/^https?:\/\//i.test(site.domain)?site.domain.replace(/\/+$/,''):`https://${site.domain.replace(/\/+$/,'')}`):'';
 const host=(site?.domain||'').replace(/^https?:\/\//i,'').replace(/\/+$/,'');const pageLabel=(path:unknown)=>{const text=String(path??'/');if(!host)return text;return text==='/'?host:`${host}${text.startsWith('/')?text:`/${text}`}`;};const pageLink=(path:unknown)=>{const text=String(path??'/');if(!origin)return text;return <a href={`${origin}${text.startsWith('/')?text:`/${text}`}`} target="_blank" rel="noopener noreferrer">{pageLabel(path)}</a>;};
 // 心跳只是停留时长的心跳包，不是一次访问；把它混进访问列表会让人以为有 8 次访问。
 
 const tops:[string,string][]=[['topPages','实时Top页面'],['topSources','实时Top来源'],['topGeography','实时Top地域']];
 const anyTop=tops.some(([key])=>Array.isArray(data[key])&&(data[key] as Row[]).length>0);
 const range=`${stamp(metadata.from)} — ${stamp(metadata.to)}${timezone?`（${timezone}）`:''}`;
 const pv=complete?String(metadata.pv):'—';
 const coverage=`${Math.round(Number(metadata.coverage||0)*100)}%`;
 const idle=events.length===0&&(!complete||Number(metadata.pv||0)===0);

 // 所有卡片共用同一套外壳，网格保证同行的卡片等高、边缘对齐。
 const kpi=<section className="panel rt-card rt-kpi" aria-label={en?'Live metrics':'实时指标'}>
  <div className="rt-kpi-main"><span>{en?'Active in the last 5 minutes':'近 5 分钟活跃'}</span><strong className="livecount">{online}</strong></div>
  <div className="rt-kpi-meta">
   <p><span>{en?'Views (30m)':'近30分钟浏览量'}</span><strong data-testid="realtime-total">{pv}</strong></p>
   <p><span>{en?'Coverage':'覆盖率'}</span><strong>{coverage}</strong></p>
  </div>
  <p className="rt-range">{range}</p>
 </section>;

 if (idle) return <div className="rt-grid rt-grid-idle">
  <section className="panel rt-card rt-idle">
   {kpi}
   <p className="rt-idle-note">{en?'No events in the last 30 minutes. The minute bars and visit stream appear here as soon as the tracker reports a visit.':'过去 30 分钟没有采集到事件。埋点上报后，分钟柱与访问流会自动出现在这里。'}</p>
  </section>
 </div>;

 return <div className="rt-grid">
  {kpi}
  <section className="panel rt-card rt-chart">
   <h3>{en?'Minutes in this window':'这次预览的分钟柱'}</h3>
   <p className="hint">{en?'Bars count only the latest events returned by this realtime response.':'分钟柱只统计本次接口返回的最近事件。'}</p>
   <div className="minute-bars" aria-hidden="true">{buckets.map(bucket=><i key={bucket.index} className={bucket.count?'on':undefined} style={{height:bucket.count?`${Math.max(10,bucket.count/peak*100)}%`:'100%'}}/>)}</div>
  </section>
  <section className="panel rt-card rt-visits">
   <h3>{en?'Recent visits':'最近访问'}</h3>
   <p className="rt-legend">{en?'A page view is one visit. A presence heartbeat is reported every 15s and only accumulates time on page.':'页面浏览代表一次访问；停留心跳每 15 秒上报一次，只用来累计停留时长，不代表新的访问。'}</p>{events.length?<ol className="visit-stream">{events.slice(0,8).map((event,index)=><li key={String(event.event_id||index)}><time>{clock(event.ts)}</time><span>{String(event.path||event.type||'—')}</span><small>{en?String(event.type||''):(eventLabels[String(event.type||'')]||String(event.type||''))}</small></li>)}</ol>
    :<p className="empty">{en?'No events in this window.':'这段时间没有事件。'}</p>}
  </section>
  {!complete?<section className="panel rt-card rt-wide"><p className="notice">{t('实时窗口不完整，Top不可用，不显示伪零值。')}</p></section>
   :anyTop?tops.map(([key,title])=>{const list=Array.isArray(data[key])?(data[key] as Row[]):[];const isPages=key==='topPages';return <section className="panel rt-card rt-top" key={key} aria-label={t(title)}>
    <h3>{t(title)}</h3>
    {list.length?<div className="table-wrap compact"><table><thead><tr>{Object.keys(list[0]||{}).map(name=><th key={name}>{ownValue(labels,name)||name}</th>)}</tr></thead><tbody>{list.map((row,index)=><tr key={index}>{Object.entries(row).map(([name,value])=><td key={name}>{value===null?'—':isPages&&name==='path'?pageLink(value):humanize(name,value,en)}</td>)}</tr>)}</tbody></table></div>:<p className="empty">{en?'Nothing in this window.':'该窗口暂无数据。'}</p>}
   </section>;})
   :<section className="panel rt-card rt-wide"><p className="empty">{en?'No breakdown available for this window.':'该窗口暂无细分数据。'}</p></section>}
 </div>;
}
