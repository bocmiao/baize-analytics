import {useEffect,useRef,useState} from 'react';
import {language} from './i18n';
import './CommunityContact.css';

const QQ_GROUP='2639496';

export function CommunityContact({placement='menu'}:{placement?:'menu'|'footer'}){
 const en=language()==='en';
 const [feedback,setFeedback]=useState<'copied'|'manual'|null>(null);
 const numberRef=useRef<HTMLSpanElement>(null);
 useEffect(()=>{
  if(!feedback)return;
  const timer=setTimeout(()=>setFeedback(null),4000);
  return()=>clearTimeout(timer);
 },[feedback]);
 async function copyGroup(){
  let copied=false;
  try{await navigator.clipboard.writeText(QQ_GROUP);copied=true;}catch{
   // NAS HTTP pages may not expose the Clipboard API.
   const input=document.createElement('textarea');
   const previousFocus=document.activeElement as HTMLElement|null;
   input.value=QQ_GROUP;input.readOnly=true;input.tabIndex=-1;
   input.style.cssText='position:fixed;inset:0 auto auto 0;width:1px;height:1px;opacity:0;pointer-events:none';
   document.body.append(input);
   try{input.focus({preventScroll:true});input.select();copied=document.execCommand('copy');}catch{copied=false;}finally{input.remove();previousFocus?.focus({preventScroll:true});}
  }
  setFeedback(copied?'copied':'manual');
  if(!copied&&numberRef.current){
   const range=document.createRange();range.selectNodeContents(numberRef.current);
   const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);
  }
 }
 return <div className={`community-contact community-contact--${placement}`}>
  <span className="community-contact-label">{en?'QQ community':'QQ 交流群'}</span>
  <button type="button" className="community-contact-button" onClick={()=>void copyGroup()} aria-label={en?`Copy QQ group number ${QQ_GROUP}`:`复制 QQ 群号 ${QQ_GROUP}`}>
   <span ref={numberRef} className="community-contact-number">{QQ_GROUP}</span>
   <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/></svg>
  </button>
  <span className="community-contact-feedback" role="status" aria-live="polite">{feedback==='copied'?(en?'Group number copied':'群号已复制'):feedback==='manual'?(en?'Select or long-press the number to copy.':'请选中或长按群号复制。'):''}</span>
 </div>;
}
