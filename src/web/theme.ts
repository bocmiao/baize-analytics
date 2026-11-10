export type ChartPalette={
 jade:string;gold:string;cinnabar:string;mist:string;previous:string;ink:string;muted:string;
 line:string;grid:string;area:string;empty:string;tip:string;tipText:string;emphasis:string;
};

/** Light is the default. Dark follows a saved choice or ?theme=dark. */
export function readTheme():'light'|'dark'{
 const query=new URLSearchParams(location.search).get('theme');
 if(query==='dark'||query==='light')return query;
 let stored:string|null=null;
 try{stored=localStorage.getItem('baize-theme');}catch{/* The current page still works when browser storage is unavailable. */}
 if(stored==='dark'||stored==='light')return stored;
 return 'light';
}

export function motionOff(){
 const query=new URLSearchParams(location.search).get('motion');
 return query==='off'||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function bootTheme(){
 const theme=readTheme();
 applyTheme(theme);
 document.documentElement.dataset.motion=motionOff()?'off':'on';
 document.documentElement.classList.toggle('rm',motionOff());
}

export function currentTheme():'light'|'dark'{return typeof document!=='undefined'&&document.documentElement.dataset.theme==='dark'?'dark':'light';}

function applyTheme(theme:'light'|'dark'){
 document.documentElement.dataset.theme=theme;
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#0f1725':'#f5f7fb');
}

export function subscribeTheme(listener:()=>void){
 const onStorage=(event:StorageEvent)=>{
  if(event.key!==null&&event.key!=='baize-theme')return;
  const next=event.newValue==='dark'||event.newValue==='light'?event.newValue:readTheme();
  if(currentTheme()===next)return;
  applyTheme(next);
  window.dispatchEvent(new Event('baize-theme'));
 };
 window.addEventListener('baize-theme',listener);
 window.addEventListener('storage',onStorage);
 return()=>{window.removeEventListener('baize-theme',listener);window.removeEventListener('storage',onStorage);};
}

let transitionTimer:number|undefined;
export function toggleTheme(){
 const next=currentTheme()==='dark'?'light':'dark';
 if(transitionTimer!==undefined)window.clearTimeout(transitionTimer);
 if(!motionOff()){
  document.documentElement.classList.add('theming');
  transitionTimer=window.setTimeout(()=>document.documentElement.classList.remove('theming'),400);
 }
 applyTheme(next);
 try{localStorage.setItem('baize-theme',next);}catch{/* Keep this selection for the mounted page even if it cannot be saved. */}
 window.dispatchEvent(new Event('baize-theme'));
 return next;
}

export function chartPalette():ChartPalette{
 const dark=document.documentElement.dataset.theme==='dark';
 return dark?{
  jade:'#82adff',gold:'#7cd8bc',cinnabar:'#F0705A',mist:'#6E6E6E',previous:'#8b9eb9',ink:'#EDEDED',muted:'#a8b7cd',
  line:'#232323',grid:'#2b3a52',area:'rgba(130,173,255,.12)',empty:'#17243b',tip:'#172235',tipText:'#EDEDED',emphasis:'#82adff'
 }:{
  jade:'#2563eb',gold:'#16826b',cinnabar:'#C2412D',mist:'#8F8F8F',previous:'#94a3b8',ink:'#17243b',muted:'#68758a',
  line:'#EBEBEB',grid:'#edf0f5',area:'rgba(37,99,235,.10)',empty:'#F5F5F5',tip:'#FFFFFF',tipText:'#17243b',emphasis:'#2563eb'
 };
}

export function chartMotion(){return document.documentElement.dataset.motion!=='off';}
