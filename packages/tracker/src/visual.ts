import type {Tracker} from './index';
import {elementSelector,privateSelector,capturePathMatches,structuralSelector,type CaptureRule} from './visual-model';
declare global {interface Window {baize?:Tracker}}
const tracker=window.baize;
if(tracker&&tracker.registerModule('visual')){
 const config=tracker.getConfig(),origin=new URL(config.apiHost,location.href).origin,nonce=new URLSearchParams(location.hash.slice(1)).get('baize-editor');
 if(nonce&&/^[a-f0-9]{48}$/.test(nonce)&&window.parent!==window){
  let active=false;const outline=document.createElement('div');Object.assign(outline.style,{position:'fixed',pointerEvents:'none',zIndex:'2147483647',border:'2px solid #188fff',background:'rgba(24,143,255,.08)',display:'none'});document.documentElement.append(outline);
  const send=(type:string,extra:Record<string,unknown>={})=>window.parent.postMessage({type,nonce,...extra},origin);
  window.addEventListener('message',event=>{if(event.source!==window.parent||event.origin!==origin||event.data?.nonce!==nonce||event.data?.type!=='baize:editor:start')return;active=true;send('baize:editor:ready',{path:location.pathname,height:document.documentElement.scrollHeight,width:innerWidth});});
  document.addEventListener('pointermove',event=>{if(!active)return;const target=event.target instanceof Element?event.target:null;if(!target||target.closest(privateSelector)){outline.style.display='none';return;}const rect=target.getBoundingClientRect();Object.assign(outline.style,{display:'block',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px'});},true);
  document.addEventListener('click',event=>{if(!active)return;event.preventDefault();event.stopImmediatePropagation();const target=event.target instanceof Element?event.target:null,selector=target?elementSelector(target):null;if(selector)send('baize:editor:pick',{selector,path:location.pathname});},true);
 }else void tracker.ready.then(async()=>{
  if(!tracker.isAllowed())return;try{const response=await fetch(config.apiHost.replace(/\/$/,'')+'/api/tracker/config/'+encodeURIComponent(config.siteId),{credentials:'omit'});if(!response.ok)return;const rules=((await response.json()).event_capture_rules||[]) as CaptureRule[];document.addEventListener('click',event=>{if(!tracker.isAllowed())return;const target=event.target instanceof Element?event.target:null;if(!target||target.closest(privateSelector))return;for(const rule of rules){if(!rule.enabled||!structuralSelector.test(rule.selector)||!capturePathMatches(rule,location.pathname))continue;try{if(target.closest(rule.selector))tracker.track(rule.name,{capture:'visual'});}catch{/* invalid stored rule */}}});}catch{/* preserve ordinary tracking if rules unavailable */}
 });
}
