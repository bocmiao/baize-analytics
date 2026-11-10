import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {readWorkspaceRoute,workspaceUrl,type WorkspaceRoute} from './workspaceRoute';

export function workspacePageChanged(previous:Pick<WorkspaceRoute,'siteId'|'report'>,next:Pick<WorkspaceRoute,'siteId'|'report'>){return previous.siteId!==next.siteId||previous.report!==next.report;}
export function useWorkspaceRoute(){
 const [route,setRoute]=useState(()=>readWorkspaceRoute(location.search)),current=useRef(route),displayed=useRef(route);
 useLayoutEffect(()=>{
  if(workspacePageChanged(displayed.current,route))window.scrollTo({top:0,left:0,behavior:'instant'});
  displayed.current=route;
 },[route.siteId,route.report]);
 useEffect(()=>{
  const previousRestoration=history.scrollRestoration;history.scrollRestoration='manual';
  const restore=()=>{const next=readWorkspaceRoute(location.search);current.current=next;setRoute(next);};
  window.addEventListener('popstate',restore);
  return()=>{window.removeEventListener('popstate',restore);history.scrollRestoration=previousRestoration;};
 },[]);
 function navigate(patch:Partial<WorkspaceRoute>,replace=false){
  const next={...current.current,...patch};
  if(next.report==='daily'&&(next.to||next.from)){next.from=next.to||next.from;next.to=next.from;}
  current.current=next;setRoute(next);const url=workspaceUrl(next);
  if(location.pathname+location.search!==url)history[replace?'replaceState':'pushState'](null,'',url);
 }
 return {route,navigate};
}
