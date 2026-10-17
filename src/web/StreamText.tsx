import {useEffect,useState} from 'react';

/** Reveals real copy. Reduced motion and ?motion=off show the final string immediately. */
export function StreamText({text,className}:{text:string;className?:string}){
 const [count,setCount]=useState(()=>document.documentElement.dataset.motion==='off'?text.length:0);
 useEffect(()=>{
  if(document.documentElement.dataset.motion==='off'||text.length===0){setCount(text.length);return;}
  setCount(0);
  const step=Math.max(1,Math.ceil(text.length/24));
  let index=0;
  const timer=window.setInterval(()=>{
   index=Math.min(text.length,index+step);
   setCount(index);
   if(index>=text.length)window.clearInterval(timer);
  },40);
  return()=>window.clearInterval(timer);
 },[text]);
 const done=count>=text.length;
 return <p className={`${className??''}${done?' stream-done':''}`}>{done?text:text.slice(0,count)}{!done&&<span className="stream-caret" aria-hidden="true"/>}</p>;
}

/** Rolls a displayed metric to the exact formatted string already produced by the view. */
export function CountText({text}:{text:string}){
 const [shown,setShown]=useState(text);
 const [epoch,setEpoch]=useState(0);
 useEffect(()=>{const replay=()=>setEpoch(value=>value+1);window.addEventListener('baize-replay',replay);return()=>window.removeEventListener('baize-replay',replay);},[]);
 useEffect(()=>{
  const match=/^([\d,]+)(\.\d+)?(%?)$/.exec(text);
  if(!match||document.documentElement.dataset.motion==='off'){setShown(text);return;}
  const target=Number(text.replace(/,/g,'').replace('%',''));
  if(!Number.isFinite(target)){setShown(text);return;}
  const decimals=match[2]?match[2].slice(1).length:0;
  const comma=text.includes(',');
  const suffix=match[3]??'';
  const started=performance.now();
  let frame=0;
  const tick=(now:number)=>{
   const progress=Math.min(1,(now-started)/900);
   const eased=1-Math.pow(1-progress,3);
   const value=target*eased;
   let body=decimals?value.toFixed(decimals):String(Math.round(value));
   if(comma)body=Number(body).toLocaleString('en-US',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
   setShown(progress<1?`${body}${suffix}`:text);
   if(progress<1)frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);
  return()=>cancelAnimationFrame(frame);
 },[text,epoch]);
 return <>{shown}</>;
}
