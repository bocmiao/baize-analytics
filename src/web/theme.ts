export type ChartPalette={
 jade:string;gold:string;cinnabar:string;mist:string;ink:string;muted:string;
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
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#08110F':'#12302B');
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
  jade:'#4FB39C',gold:'#D9B66A',cinnabar:'#E07A63',mist:'#8FB8AE',ink:'#E3ECE8',muted:'#A5B8B2',
  line:'#22362F',grid:'#1B2D29',area:'rgba(79,179,156,.18)',empty:'#173A33',tip:'#08110F',tipText:'#F4EFE2',emphasis:'#D9B66A'
 }:{
  jade:'#2F7D6D',gold:'#C29A4E',cinnabar:'#C2553F',mist:'#8FA39D',ink:'#14302C',muted:'#4B5F5A',
  line:'#E1E7E1',grid:'#E7EEE9',area:'rgba(47,125,109,.12)',empty:'#E3F0EB',tip:'#12302B',tipText:'#FFFFFF',emphasis:'#1E4A42'
 };
}

export function chartMotion(){return document.documentElement.dataset.motion!=='off';}
