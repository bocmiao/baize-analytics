export type ChartPalette={
 jade:string;gold:string;cinnabar:string;mist:string;ink:string;muted:string;
 line:string;grid:string;area:string;empty:string;tip:string;tipText:string;emphasis:string;
};

/** Light is the default. Dark follows a saved choice or ?theme=dark. */
export function readTheme():'light'|'dark'{
 const query=new URLSearchParams(location.search).get('theme');
 if(query==='dark'||query==='light')return query;
 const stored=localStorage.getItem('baize-theme');
 if(stored==='dark'||stored==='light')return stored;
 return 'light';
}

export function motionOff(){
 const query=new URLSearchParams(location.search).get('motion');
 return query==='off'||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function bootTheme(){
 const theme=readTheme();
 document.documentElement.dataset.theme=theme;
 document.documentElement.dataset.motion=motionOff()?'off':'on';
 document.documentElement.classList.toggle('rm',motionOff());
 const meta=document.querySelector('meta[name="theme-color"]');
 if(meta)meta.setAttribute('content',theme==='dark'?'#08110F':'#12302B');
}

export function toggleTheme(){
 const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
 document.documentElement.classList.add('theming');
 document.documentElement.dataset.theme=next;
 localStorage.setItem('baize-theme',next);
 const meta=document.querySelector('meta[name="theme-color"]');
 if(meta)meta.setAttribute('content',next==='dark'?'#08110F':'#12302B');
 window.setTimeout(()=>document.documentElement.classList.remove('theming'),400);
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
