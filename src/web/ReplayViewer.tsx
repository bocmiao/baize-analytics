import {t,language} from './i18n';
import {useEffect,useRef,useState} from 'react';
import {createReplayPlayer,replaySessions} from '../../packages/tracker/player';
import type {Row} from './api';
import {DensePanel,ReportDisclosure} from './DensePrimitives';

export default function ReplayViewer({chunks}:{chunks:Row[]}){
 const sessions=replaySessions(chunks as {session_id:string;seq:number;payload:unknown[]}[]);
 const [path,setPath]=useState(''),[selected,setSelected]=useState(''),[error,setError]=useState('');
 const paths=[...new Set(chunks.map(row=>String(row.path||'unknown')))];
 const visibleSessions=sessions.filter(value=>!path||chunks.some(row=>row.session_id===value.id&&String(row.path||'unknown')===path));
 const session=visibleSessions.find(value=>value.id===selected)||visibleSessions[0],metadata=chunks.find(row=>row.session_id===session?.id);
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!ref.current||!session)return;
  try{const player=createReplayPlayer(ref.current,session.events,{language:language()==='en'?'en':'zh-CN'});setError('');return()=>player.destroy();}
  catch(reason){setError((reason as Error).message);}
 },[session?.id,chunks]);
 const time=(value:unknown)=>{const date=new Date(String(value||''));return Number.isFinite(+date)?date.toLocaleString(language()==='en'?'en-US':'zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}):'—';};
 return <DensePanel title={t('会话回放')} className="replay-viewer">
  <div className="replay-filters"><label>{t('页面路径')}<select value={path} onChange={event=>{setPath(event.target.value);setSelected('');}}><option value="">{t('全部页面')}</option>{paths.map(value=><option key={value}>{value}</option>)}</select></label><label>{t('选择会话')}<select value={session?.id||''} disabled={!visibleSessions.length} onChange={event=>setSelected(event.target.value)}>{!visibleSessions.length&&<option value="">{t('暂无可播放会话')}</option>}{visibleSessions.map((value,index)=>{const item=chunks.find(row=>row.session_id===value.id);return <option value={value.id} key={value.id}>{index+1} · {time(item?.started_at)} · {value.events.length} {t('条记录')}</option>;})}</select></label></div>
  {metadata&&<p className="replay-context"><span title={String(metadata.path||'')}>{String(metadata.path||'unknown')}</span><time>{time(metadata.started_at)} – {time(metadata.ended_at)}</time></p>}
  {!visibleSessions.length&&<div className="dense-empty"><p>{t('所选范围暂无可播放会话。')}</p></div>}
  {error&&<p role="alert" className="error">{error}</p>}
  <div className="replay-stage" ref={ref}/>
  <ReportDisclosure title={t('回放说明')}><p>{t('回放已隐藏敏感内容，不恢复脚本、远程资源或表单值。')}</p><p>{t('每个页面实例独立播放，单次最多加载1000个片段。')}</p>{metadata&&<dl><dt>{t('页面实例')}</dt><dd>{String(metadata.page_id||'—')}</dd><dt>{t('会话标识')}</dt><dd>{session?.id}</dd></dl>}</ReportDisclosure>
 </DensePanel>;
}
