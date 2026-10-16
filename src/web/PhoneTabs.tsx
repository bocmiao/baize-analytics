import {workspaceUrl,type WorkspaceRoute} from './workspaceRoute';
import {t} from './i18n';

const shortcuts=['overview','realtime','pages','ai'] as const;

export function PhoneTabs({route,items,onNavigate}:{route:WorkspaceRoute;items:string[][];onNavigate:(report:string)=>void}){
 const available=shortcuts.flatMap(key=>items.filter(([item])=>item===key));
 if(!available.length)return null;
 return <nav className="phone-tabs" aria-label={t('手机端常用报表')}>{available.map(([key,label])=><a key={key} href={workspaceUrl({...route,report:key})} aria-current={route.report===key?'page':undefined} onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onNavigate(key);}}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d={key==='realtime'?'M3 12h4l3-7 4 14 3-7h4':key==='pages'?'M6 3h8l4 4v14H6Z':key==='ai'?'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z':'M3 10 12 3l9 7v10h-6v-6H9v6H3Z'} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg><span>{label}</span></a>)}<button type="button" onClick={()=>window.dispatchEvent(new Event('baize:open-nav'))}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg><span>{t('更多')}</span></button></nav>;
}
