import {workspaceUrl,type WorkspaceRoute} from './workspaceRoute';
import {t} from './i18n';

const preferred=['overview','realtime','pages','sources','audience','events','ai'] as const;
const icon:Record<string,string>={overview:'M3 10 12 3l9 7v10h-6v-6H9v6H3Z',realtime:'M3 12h4l3-7 4 14 3-7h4',pages:'M6 3h8l4 4v14H6Z',sources:'M4 8h7a5 5 0 0 1 5 5v7',audience:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18',events:'M7 3v12l3-3 3 6 3-2',ai:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z'};

export function PhoneTabs({route,items,onNavigate}:{route:WorkspaceRoute;items:string[][];onNavigate:(report:string)=>void}){
 const present=preferred.flatMap(key=>items.filter(([item])=>item===key));
 const current=items.find(([key])=>key===route.report);
 const available=(current&&!present.some(([key])=>key===current[0])?[...present.slice(0,3),current]:present).slice(0,4);
 if(!available.length)return null;
 return <nav className="phone-tabs" aria-label={t('手机端常用报表')}>{available.map(([key,label])=><a key={key} href={workspaceUrl({...route,report:key})} aria-current={route.report===key?'page':undefined} onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onNavigate(key);}}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d={icon[key]||icon.overview} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg><span>{label}</span></a>)}</nav>;
}
