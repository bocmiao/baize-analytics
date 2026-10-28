import {useEffect,useRef,useState} from 'react';
import {api,type Row} from './api';
import {language} from './i18n';

/** Independent, bounded live window. History filters never relabel it as history. */
export function OverviewRealtime({siteId,refresh,available=true,placement='card',onOpen}:{siteId:string;refresh:number;available?:boolean;placement?:'card'|'header';onOpen?:()=>void}){
 const [attempt,setAttempt]=useState(0);
 const [state,setState]=useState<{siteId:string;data?:Row;error?:boolean}>({siteId});
 useEffect(()=>{
  if(!available){setState({siteId});return;}
  const controller=new AbortController();let active=true;setState({siteId});
  void api<Row>(`/api/v1/sites/${encodeURIComponent(siteId)}/realtime`,undefined,'GET',controller.signal).then(data=>{if(active&&!controller.signal.aborted)setState({siteId,data});}).catch(()=>{if(active&&!controller.signal.aborted)setState({siteId,error:true});});
  return()=>{active=false;controller.abort();};
 },[siteId,refresh,attempt,available]);
 const en=language()==='en',current=state.siteId===siteId?state:{siteId},data=current.data,window=(data?.realtime||{}) as Row;
 const value=(number:unknown,available=true)=>available&&typeof number==='number'&&Number.isFinite(number)?number.toLocaleString(en?'en-US':'zh-CN'):'—';
 const onlineText=value(data?.online,data?.onlineCoverage===1),previousOnline=useRef(onlineText),[bump,setBump]=useState(false);
 useEffect(()=>{if(previousOnline.current===onlineText)return;previousOnline.current=onlineText;if(onlineText==='—'||document.documentElement.dataset.motion==='off')return;setBump(true);const timer=setTimeout(()=>setBump(false),320);return()=>clearTimeout(timer);},[onlineText]);
 if(!available)return null;
 if(placement==='header')return <a className="overview-realtime live" href="#live" aria-label={en?'Live traffic':'实时流量'} aria-busy={!data&&!current.error} onClick={event=>{if((event.target as HTMLElement).closest('button'))return;event.preventDefault();onOpen?.();}}><span className="overview-live-dot" aria-hidden="true"/><strong className={bump?'livecount bump':'livecount'}>{onlineText}</strong><span>{en?'online':'人在线'}</span>{current.error&&<button type="button" onClick={event=>{event.preventDefault();event.stopPropagation();setAttempt(value=>value+1);}}>{en?'Retry':'重试'}</button>}</a>;
 return <section className="overview-realtime" aria-label={en?'Live traffic':'实时流量'} aria-busy={!data&&!current.error}>
  <div className="overview-live-heading"><span className="overview-live-dot" aria-hidden="true"/>{en?'Live traffic':'实时流量'}<small>{en?'Refresh to update':'刷新更新'}</small></div>
  <div className="overview-live-values"><article><span>{en?'Active · last 5 minutes':'近5分钟活跃'}</span><strong className={bump?'livecount bump':'livecount'}>{onlineText}</strong><small>{en?'Distinct heartbeat visitors':'心跳访客去重'}</small></article><article><span>{en?'Pageviews · last 30 minutes':'近30分钟浏览'}</span><strong>{value(window.pv,window.coverage===1)}</strong><small>{window.coverage===1?en?'Complete window':'完整窗口':en?'Window unavailable':'窗口尚不可用'}</small></article></div>
  {current.error?<p role="status">{en?'Live traffic is unavailable.':'实时流量暂不可用。'} <button type="button" onClick={()=>setAttempt(v=>v+1)}>{en?'Retry':'重试'}</button></p>:<p className="overview-live-note">{en?'Independent of the history period and filters.':'独立于历史日期与筛选条件。'}</p>}
 </section>;
}
