import {useEffect} from 'react';

export function useMobileDateSheet(open:boolean,onClose:()=>void){
 useEffect(()=>{
  if(!open||!window.matchMedia('(max-width:767px)').matches)return;
  const panel=document.getElementById('date-range-sheet'),trigger=document.querySelector<HTMLButtonElement>('.date-range-trigger');
  if(!panel)return;
  const controls=()=>Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')).filter(element=>element.getClientRects().length>0);
  const overflow=document.body.style.overflow;document.body.style.overflow='hidden';panel.setAttribute('aria-modal','true');controls()[0]?.focus();
  const keydown=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();onClose();return;}if(event.key!=='Tab')return;const list=controls(),first=list[0],last=list[list.length-1];if(!first||!last){event.preventDefault();return;}if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}};
  document.addEventListener('keydown',keydown);
  return()=>{document.removeEventListener('keydown',keydown);document.body.style.overflow=overflow;panel.removeAttribute('aria-modal');trigger?.focus();};
 },[open,onClose]);
}
