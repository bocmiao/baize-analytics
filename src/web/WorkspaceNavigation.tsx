import {Fragment,useEffect,useRef,useState,type KeyboardEvent as ReactKeyboardEvent,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {language} from './i18n';
import {workspaceUrl,type WorkspaceRoute} from './workspaceRoute';
import {referenceGroupIsExpandable,navigationSections,permittedNavigation,type ReferenceLink,type ReferenceNavigationItem} from './51laNavigation';

function NavigationIcon({name}:{name:string}){
 const paths:Record<string,ReactNode>={
  home:<><path d="m2 7 6-5 6 5v7H3V7"/><path d="M6 14V9h4v5"/></>,
  clock:<><circle cx="8" cy="8" r="5.5"/><path d="M8 4.5V8l2 1.5"/></>,
  compass:<><circle cx="8" cy="8" r="5.5"/><path d="m10.5 5.5-1.4 3.6-3.6 1.4 1.4-3.6z"/></>,
  trend:<path d="M2 3v10h12M4 10l3-3 2 2 4-5"/>,
  sources:<><circle cx="4" cy="4" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="4" cy="12" r="2"/><circle cx="12" cy="12" r="2"/></>,
  content:<path d="M3 14V6h3v8M7 14V2h3v12M11 14V4h3v10"/>,
  pie:<path d="M7 2a6 6 0 1 0 7 7H7zM9 2v5h5a6 6 0 0 0-5-5z"/>,
  visitor:<><circle cx="8" cy="5" r="2.5"/><path d="M3 14v-2a5 5 0 0 1 10 0v2z"/></>,
  channels:<><circle cx="3" cy="4" r="1.5"/><circle cx="13" cy="4" r="1.5"/><circle cx="8" cy="12" r="1.5"/><path d="m4 5 3 5m5-5-3 5M5 4h6"/></>,
  heatmap:<><circle cx="4" cy="5" r="1"/><circle cx="10" cy="3" r="1"/><circle cx="8" cy="8" r="2"/><circle cx="3" cy="12" r="1"/><circle cx="13" cy="11" r="1.5"/></>,
  replay:<><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="m7 6 3 2-3 2z"/></>,
  behavior:<><circle cx="6" cy="4" r="2"/><path d="M2 13v-2a4 4 0 0 1 8 0v2M11 3a2 2 0 0 1 0 4m1 2a3 3 0 0 1 2 3v1"/></>,
  bot:<><ellipse cx="8" cy="9" rx="3" ry="4"/><path d="m6 3 2 2 2-2M5 7 2 5m3 4H1m4 2-3 3m9-7 3-2m-3 4h4m-4 2 3 3"/></>,
  settings:<><circle cx="8" cy="8" r="2"/><path d="M6 2h4l.5 2 1.5 1 2-.5 1 3-1.5 1.5V11l-2 2-2-.5L8 14l-3-1-.5-2-2-1V7L4 6l.5-2z"/></>,
  more:<><circle cx="3" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="13" cy="8" r="1"/></>,
 };
 return <svg className="la51-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.more}</svg>;
}

export function WorkspaceNavigation({route,items,onNavigate,children,account,identity}:{route:WorkspaceRoute;items:string[][];onNavigate:(report:string)=>void;children:(close:()=>void)=>ReactNode;account?:(close:()=>void)=>ReactNode;identity?:{name:string;detail:string}}){
 const en=language()==='en';
 const groups=permittedNavigation(items.map(([key])=>key));
 const activeGroup=groups.find(group=>group.links.some(link=>link.key===route.report));
 const [expanded,setExpanded]=useState(activeGroup&&referenceGroupIsExpandable(activeGroup.id)?activeGroup.id:'');
 const [drawerOpen,setDrawerOpen]=useState(false);
 const [collapsed,setCollapsed]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(min-width:768px) and (max-width:1023px)').matches);
 const [mobile,setMobile]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(max-width:767px)').matches);
 const [flyout,setFlyout]=useState<{id:string;top:number}|null>(null);
 const menuRef=useRef<HTMLButtonElement>(null),sidebarRef=useRef<HTMLElement>(null),accountRef=useRef<HTMLDetailsElement>(null);
 const flyoutRef=useRef<HTMLDivElement>(null),flyoutTriggerRef=useRef<HTMLElement|null>(null);
 const closeTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null),focusFlyoutRef=useRef<'first'|'last'|null>(null),skipFocusOpenRef=useRef(false);
 const rail=collapsed&&!mobile;

 const flyoutGroup=groups.find(group=>group.id===flyout?.id);

 useEffect(()=>{
  const phone=window.matchMedia('(max-width:767px)'),tablet=window.matchMedia('(min-width:768px) and (max-width:1023px)');
  const changed=()=>{setMobile(phone.matches);setCollapsed(tablet.matches);setDrawerOpen(false);};
  phone.addEventListener('change',changed);tablet.addEventListener('change',changed);
  return()=>{phone.removeEventListener('change',changed);tablet.removeEventListener('change',changed);};
 },[]);
 useEffect(()=>{
  const next=permittedNavigation(items.map(([key])=>key)).find(group=>group.links.some(link=>link.key===route.report));
  if(next&&referenceGroupIsExpandable(next.id))setExpanded(next.id);

  setDrawerOpen(false);
  setFlyout(null);
 },[route.report,route.siteId]);
 useEffect(()=>{setFlyout(null);},[collapsed,mobile]);
 useEffect(()=>{
  const outside=(event:PointerEvent)=>{if(accountRef.current?.open&&!accountRef.current.contains(event.target as Node))accountRef.current.open=false;};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&accountRef.current?.open){accountRef.current.open=false;accountRef.current.querySelector('summary')?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[]);
 useEffect(()=>()=>{if(closeTimerRef.current)clearTimeout(closeTimerRef.current);},[]);
 useEffect(()=>{
  if(!flyout)return;
  if(focusFlyoutRef.current){const choices=flyoutRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');(focusFlyoutRef.current==='last'?choices?.[choices.length-1]:choices?.[0])?.focus();focusFlyoutRef.current=null;}
  const outside=(event:PointerEvent)=>{const target=event.target as Node;if(!flyoutRef.current?.contains(target)&&!flyoutTriggerRef.current?.contains(target))setFlyout(null);};
  const dismiss=()=>setFlyout(null);
  document.addEventListener('pointerdown',outside);window.addEventListener('resize',dismiss);sidebarRef.current?.addEventListener('scroll',dismiss);
  const sidebar=sidebarRef.current;
  return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',dismiss);sidebar?.removeEventListener('scroll',dismiss);};
 },[flyout]);
 useEffect(()=>{
  if(!mobile||!drawerOpen)return;
  const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const main=document.getElementById('workspace-main'),previousInert=main?.inert;
  if(main)main.inert=true;
  const focusable=()=>Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],summary,select:not([disabled]),[tabindex="0"]')||[]).filter(element=>element.getClientRects().length>0);
  focusable()[0]?.focus();
  const keydown=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();setDrawerOpen(false);return;}
   if(event.key!=='Tab')return;
   const options=focusable();if(!options.length){event.preventDefault();return;}
   const first=options[0],last=options[options.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',keydown);
  return()=>{document.removeEventListener('keydown',keydown);document.body.style.overflow=previousOverflow;if(main)main.inert=previousInert??false;menuRef.current?.focus();};
 },[mobile,drawerOpen]);
 function cancelFlyoutClose(){if(closeTimerRef.current){clearTimeout(closeTimerRef.current);closeTimerRef.current=null;}}
 function close(){setDrawerOpen(false);setFlyout(null);cancelFlyoutClose();if(accountRef.current)accountRef.current.open=false;}
 function openFlyout(id:string,trigger:HTMLElement,focus?:'first'|'last'){
  if(!rail)return;
  cancelFlyoutClose();flyoutTriggerRef.current=trigger;focusFlyoutRef.current=focus||null;
  const group=groups.find(item=>item.id===id),count=group?.links.length||0;
  const height=Math.min(window.innerHeight-68,count*49+(id==='configuration'?60:0));
  setFlyout({id,top:Math.max(60,Math.min(trigger.getBoundingClientRect().top,window.innerHeight-height-8))});
 }
 function delayFlyoutClose(){cancelFlyoutClose();closeTimerRef.current=setTimeout(()=>{if(!flyoutRef.current?.contains(document.activeElement)&&document.activeElement!==flyoutTriggerRef.current)setFlyout(null);},120);}
 function blurFlyout(next:EventTarget|null){if(next instanceof Node&&(flyoutRef.current?.contains(next)||flyoutTriggerRef.current?.contains(next)))return;setFlyout(null);}
 function returnToTrigger(){setFlyout(null);cancelFlyoutClose();if(document.activeElement!==flyoutTriggerRef.current){skipFocusOpenRef.current=true;flyoutTriggerRef.current?.focus();}}
 function triggerKeys(event:ReactKeyboardEvent<HTMLElement>,id:string){
  if(!rail)return;
  if(['ArrowRight','ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openFlyout(id,event.currentTarget,event.key==='ArrowUp'?'last':'first');}
  else if(event.key==='Escape'){event.preventDefault();returnToTrigger();}
 }
 function flyoutKeys(event:ReactKeyboardEvent<HTMLDivElement>){
  if(event.key==='Escape'||event.key==='ArrowLeft'){event.preventDefault();event.stopPropagation();returnToTrigger();return;}
  if(event.key==='Tab'){
   event.preventDefault();const choices=Array.from(document.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]')).filter(item=>item.tabIndex>=0&&item.getClientRects().length>0&&!flyoutRef.current?.contains(item)),index=choices.indexOf(flyoutTriggerRef.current!);
   returnToTrigger();choices[index+(event.shiftKey?-1:1)]?.focus();return;
  }
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();const choices=Array.from(flyoutRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')||[]),index=choices.indexOf(document.activeElement as HTMLElement);
  const next=event.key==='Home'?0:event.key==='End'?choices.length-1:(index+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length;choices[next]?.focus();
 }
 function flyoutTrigger(id:string){return {
  onMouseEnter:(event:{currentTarget:HTMLElement})=>openFlyout(id,event.currentTarget),
  onMouseLeave:delayFlyoutClose,
  onFocus:(event:{currentTarget:HTMLElement})=>{if(skipFocusOpenRef.current){skipFocusOpenRef.current=false;return;}openFlyout(id,event.currentTarget);},
  onBlur:(event:{relatedTarget:EventTarget|null})=>blurFlyout(event.relatedTarget),
  onKeyDown:(event:ReactKeyboardEvent<HTMLElement>)=>triggerKeys(event,id),
 };}
 function link(item:ReferenceLink,icon?:string,inFlyout=false,triggerId?:string){
  return <a key={item.key} href={workspaceUrl({...route,report:item.key})} aria-label={en?item.en:item.zh} aria-current={route.report===item.key?'page':undefined} title={en?item.en:item.zh} role={inFlyout?'menuitem':undefined} tabIndex={inFlyout?-1:undefined} aria-haspopup={triggerId&&rail?'menu':undefined} aria-expanded={triggerId&&rail?flyout?.id===triggerId:undefined} aria-controls={triggerId&&rail&&flyout?.id===triggerId?'la51-flyout':undefined} {...triggerId?flyoutTrigger(triggerId):{}} onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onNavigate(item.key);close();}}>{icon&&<NavigationIcon name={icon}/>}<span>{en?item.en:item.zh}</span></a>;
 }
 function groupLinks(group:ReferenceNavigationItem,inFlyout=false){
  return <>{group.links.filter(item=>!item.section).map(item=>link(item,undefined,inFlyout))}{navigationSections.map(section=>{
   const members=group.links.filter(item=>item.section===section.id);if(!members.length)return null;
   if(inFlyout)return <div key={section.id} role="group" aria-label={en?section.en:section.zh}><div className="la51-flyout-group-title" role="presentation">{en?section.en:section.zh}</div>{members.map(item=>link(item,undefined,true))}</div>;
   return <details key={section.id} className="baize-nav-settings-section" open={members.some(item=>item.key===route.report)}><summary><span>{en?section.en:section.zh}</span><svg className="baize-settings-chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 2 4 4-4 4"/></svg></summary>{members.map(item=>link(item))}</details>;
  })}</>;
 }
 return <div id="workspace-navigation" className={`la51-navigation${collapsed&&!mobile?' is-collapsed':''}${drawerOpen?' is-drawer-open':''}`} aria-label={en?'Workspace navigation':'工作空间导航'}>
  <header className="la51-topbar">
   <a href="/" className="brand la51-brand" aria-label={en?'Baize Analytics':'白泽统计'}><img src="/brand/baize-head-96.png" width="32" height="32" alt=""/><span className="brand-name">{en?'Baize':'白泽统计'}<small>{en?'ANALYTICS':'BAIZE ANALYTICS'}</small></span></a>
   <button ref={menuRef} type="button" className="la51-menu-toggle" aria-label={en?'Menu':'菜单'} aria-expanded={drawerOpen} aria-controls="la51-sidebar" onClick={()=>setDrawerOpen(value=>!value)}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14"/></svg></button>
   <span className="la51-topbar-space"/>
   {account&&<details ref={accountRef} className="nav-account"><summary aria-label={en?'Account settings':'账户设置'}><span className="nav-identity"><b title={identity?.name}>{identity?.name||(en?'Account':'账户')}</b><small>{identity?.detail||(en?'Account and language':'账户与语言')}</small></span><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><path d="m3 4 3 3 3-3"/></svg></summary><div className="nav-account-controls">{account(close)}</div></details>}
  </header>
  {mobile&&drawerOpen&&<button type="button" className="la51-drawer-backdrop" tabIndex={-1} aria-label={en?'Close navigation':'关闭导航'} onClick={close}/>}
  <aside id="la51-sidebar" ref={sidebarRef} className="la51-sidebar" role={mobile?'dialog':undefined} aria-modal={mobile&&drawerOpen?true:undefined} aria-label={en?'Reports and settings':'分析与设置'} aria-hidden={mobile&&!drawerOpen?true:undefined}>
   <div className="la51-site-row"><div className="la51-site">{children(close)}</div><button type="button" className="la51-sidebar-collapse" aria-label={mobile?(en?'Close navigation':'关闭导航'):(collapsed?(en?'Expand navigation':'展开导航'):(en?'Collapse navigation':'收起导航'))} onClick={()=>mobile?close():setCollapsed(value=>!value)}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 3v10M9 4 5 8l4 4"/></svg></button></div>
   <nav className="v3-tabs la51-report-nav" aria-label={en?'Report pages':'报表页面'}>
    {groups.map(group=>{
     const grouped=referenceGroupIsExpandable(group.id),selected=group.links.some(item=>item.key===route.report);
     if(group.id==='overview')return <div key={group.id} className={`la51-overview-links${selected?' is-current':''}`}>{link(group.links[0],group.icon,false,group.links.length>1?'overview':undefined)}{group.links.slice(1).map(item=><Fragment key={item.key}><span className="la51-overview-divider" aria-hidden="true">|</span>{link(item)}</Fragment>)}</div>;
     if(!grouped)return <div key={group.id} className="la51-nav-single">{link(group.links[0],group.icon)}</div>;
     const open=expanded===group.id&&!rail;
     return <section key={group.id} className={`navigation-group la51-nav-group${selected?' contains-current':''}`}><button type="button" title={en?group.en:group.zh} aria-label={en?group.en:group.zh} aria-haspopup={rail?'menu':undefined} aria-expanded={rail?flyout?.id===group.id:open} aria-controls={rail?(flyout?.id===group.id?'la51-flyout':undefined):`la51-nav-${group.id}`} {...flyoutTrigger(group.id)} onClick={event=>{if(rail)openFlyout(group.id,event.currentTarget,'first');else setExpanded(open?'':group.id);}}><NavigationIcon name={group.icon}/><span>{en?group.en:group.zh}</span><svg className="la51-chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 2 4 4-4 4"/></svg></button><div id={`la51-nav-${group.id}`} className="la51-submenu" hidden={!open}>{groupLinks(group)}</div></section>;
    })}
   </nav>
  </aside>
  {rail&&flyout&&createPortal(<div id="la51-flyout" ref={flyoutRef} className="la51-flyout" role="menu" aria-label={en?flyoutGroup?.en:flyoutGroup?.zh} style={{top:flyout.top}} onMouseEnter={cancelFlyoutClose} onMouseLeave={delayFlyoutClose} onBlur={event=>blurFlyout(event.relatedTarget)} onKeyDown={flyoutKeys}>
   <div className="la51-flyout-title" role="presentation">{en?flyoutGroup?.en:flyoutGroup?.zh}</div>
   {flyoutGroup&&groupLinks(flyoutGroup,true)}
  </div>,document.body)}
 </div>;
}
