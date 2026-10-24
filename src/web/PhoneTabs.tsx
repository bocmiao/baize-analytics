import {useEffect,useState} from 'react';
import {workspaceUrl,type WorkspaceRoute} from './workspaceRoute';
import {t} from './i18n';

const icon:Record<string,string>={overview:'M3 10 12 3l9 7v10h-6v-6H9v6H3Z',realtime:'M3 12h4l3-7 4 14 3-7h4',pages:'M6 3h8l4 4v14H6Z',sources:'M4 8h7a5 5 0 0 1 5 5v7',audience:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18',events:'M7 3v12l3-3 3 6 3-2',ai:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z',reports:'M5 4h14v4H5ZM5 10h14v4H5ZM5 16h14v4H5Z',more:'M4 7h16M4 12h16M4 17h16'};
const reportKeys=['pages','sources','audience','events'] as const;

function TabLink({route,item,onNavigate,current}:{route:WorkspaceRoute;item:string[];onNavigate:(report:string)=>void;current?:boolean}){
 const [key,label]=item;
 return <a href={workspaceUrl({...route,report:key})} aria-current={current?'page':undefined} onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onNavigate(key);}}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d={icon[key]||icon.overview} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg><span>{label}</span></a>;
}

/** Five phone destinations from the v2 comp: overview, realtime, reports, AI, more. */
export function PhoneTabs({route,items,onNavigate}:{route:WorkspaceRoute;items:string[][];onNavigate:(report:string)=>void}){
 const [phone,setPhone]=useState(()=>window.matchMedia('(max-width:767px)').matches);
 useEffect(()=>{const query=window.matchMedia('(max-width:767px)');const apply=()=>setPhone(query.matches);apply();query.addEventListener('change',apply);return()=>query.removeEventListener('change',apply);},[]);
 if(!phone)return null;
 const find=(key:string)=>items.find(([item])=>item===key);
 const overview=find('overview'),realtime=find('realtime'),ai=find('ai');
 const reports=reportKeys.flatMap(key=>{const item=find(key);return item?[item]:[];});
 const slots:(['link',string[]]|['reports']|['more'])[]=[];
 if(overview)slots.push(['link',overview]);
 if(realtime)slots.push(['link',realtime]);
 else for(const item of reports.slice(0,2))slots.push(['link',item]);
 if(realtime&&reports.length)slots.push(['reports']);
 if(ai)slots.push(['link',ai]);
 slots.push(['more']);
 const visible=slots.slice(0,5);
 if(visible.length<2)return null;
 const reportCurrent=reports.some(([key])=>key===route.report);
 return <nav className="phone-tabs" aria-label={t('手机端常用报表')}>{visible.map(slot=>{
  if(slot[0]==='more')return <button type="button" key="more" onClick={()=>window.dispatchEvent(new Event('baize:open-nav'))}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d={icon.more} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg><span>{t('更多')}</span></button>;
  if(slot[0]==='reports')return <details key="reports" className="phone-report-menu"><summary aria-current={reportCurrent?'page':undefined}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d={icon.reports} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg><span>{t('报表')}</span></summary><div>{reports.map(item=><TabLink key={item[0]} route={route} item={item} onNavigate={onNavigate} current={route.report===item[0]}/>)}</div></details>;
  return <TabLink key={slot[1][0]} route={route} item={slot[1]} onNavigate={onNavigate} current={route.report===slot[1][0]}/>;
 })}</nav>;
}
