import type { Tracker } from './index';
import {elementSelector,privateSelector,heatmapPathMatches} from './visual-model';
const tracker=(window as Window & {baize?:Tracker}).baize;
if(tracker&&tracker.registerModule('heatmap'))void tracker.ready.then(async()=>{
 if(!tracker.getConfig().heatmap)return;
 let pages:string[]=[];try{const config=tracker.getConfig(),response=await fetch(config.apiHost.replace(/\/$/,'')+'/api/tracker/config/'+encodeURIComponent(config.siteId),{credentials:'omit'});if(!response.ok)return;pages=(await response.json()).heatmap_pages||[];}catch{return;}
 const depths=new Set<number>();let timer:ReturnType<typeof setTimeout>|undefined;tracker.onPage(()=>depths.clear());
 const emit=(kind:'click'|'scroll',x:number,y:number,element?:string)=>{if(!heatmapPathMatches(pages,location.pathname))return;tracker.emit('heatmap',{heatmap:{kind,x:Math.max(0,Math.min(1,Math.round(x*100)/100)),y:Math.max(0,Math.min(1,Math.round(y*100)/100)),width:innerWidth,height:innerHeight,element,document_width:Math.min(20000,document.documentElement.scrollWidth),document_height:Math.min(200000,document.documentElement.scrollHeight)}});};
 document.addEventListener('click',e=>{if(!tracker.isAllowed()||!(e.target instanceof Element)||e.target.closest(privateSelector))return;emit('click',e.pageX/Math.max(1,document.documentElement.scrollWidth),e.pageY/Math.max(1,document.documentElement.scrollHeight),elementSelector(e.target)||undefined);});
 document.addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!tracker.isAllowed())return;const depth=(scrollY+innerHeight)/Math.max(1,document.documentElement.scrollHeight);for(const threshold of [.25,.5,.75,1])if(depth>=threshold&&!depths.has(threshold)){depths.add(threshold);emit('scroll',.5,threshold);}},200);},{passive:true});
});
