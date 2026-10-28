import {useState,type ReactNode} from 'react';
import {language} from './i18n';
import {ThemeToggle} from './ThemeToggle';
import {navigationGroups,workspaceUrl,type WorkspaceRoute} from './workspaceRoute';

const primaryKeys=['overview','realtime','pages','sources','audience','events','funnels','seo','ai','settings'];

export function WorkspaceNavigation({route,items,onNavigate,children,account,identity}:{route:WorkspaceRoute;items:string[][];onNavigate:(report:string)=>void;children:(close:()=>void)=>ReactNode;account?:(close:()=>void)=>ReactNode;identity?:{name:string;detail:string}}){
 const [moreOpen,setMoreOpen]=useState(false);
 const en=language()==='en';
 function close(){setMoreOpen(false);}
 function link(key:string,label:string){
  return <a key={key} href={workspaceUrl({...route,report:key})} aria-current={route.report===key?'page':undefined} onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onNavigate(key);close();}}>{label}</a>;
 }
 const primary=primaryKeys.flatMap(key=>items.filter(([itemKey])=>itemKey===key));
 const overflow=navigationGroups.map(group=>{
  const members=items.filter(([key])=>!primaryKeys.includes(key)&&group.reports.some(report=>report===key));
  return members.length?{group,members}:null;
 }).filter((value):value is {group:(typeof navigationGroups)[number];members:string[][]}=>value!==null);
 const initial=(identity?.name||(en?'Account':'账户')).slice(0,1);
 return <div id="workspace-navigation" aria-label={en?'Workspace navigation':'工作空间导航'}>
  <header className="v3-header">
   <a href="/" className="brand" aria-label={`${en?'Baize':'白泽'}BAIZE`}><span className="mark" aria-hidden="true">泽</span><span className="brand-name">{en?'Baize':'白泽'}<small>BAIZE</small></span></a>
   <div className="v3-site">{children(close)}</div>
   <div className="live"><span id="header-live"/><a className="live-fallback" href={workspaceUrl({...route,report:'realtime'})} onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onNavigate('realtime');}}>{en?'Live':'实时'}</a></div>
   <span className="v3-spacer"/>
   <ThemeToggle/>
   {account&&<details className="nav-account"><summary><span className="nav-avatar" aria-hidden="true">{initial}</span><span className="nav-identity"><b>{identity?.name||(en?'Account':'账户')}</b><small>{identity?.detail||(en?'Account and language':'账户与语言')}</small></span></summary><div className="nav-account-controls">{account(close)}</div></details>}
  </header>
  <nav className="v3-tabs" aria-label={en?'Reports and settings':'分析与设置'}>
   <div className="v3-tab-scroll">{primary.map(([key,label])=>link(key,label))}</div>
   {overflow.length>0&&<section className="navigation-group"><button type="button" aria-expanded={moreOpen} onClick={()=>setMoreOpen(value=>!value)}>{en?'More':'更多'}</button><div hidden={!moreOpen}>{overflow.map(({group,members})=><div key={group.id} className="nav-more-group"><h3>{en?group.en:group.zh}</h3>{members.map(([key,label])=>link(key,label))}</div>)}</div></section>}
  </nav>
 </div>;
}
