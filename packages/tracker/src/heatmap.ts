import type { Tracker } from './index';
const tracker=(window as Window & {baize?:Tracker}).baize;
if(tracker&&tracker.registerModule('heatmap'))void tracker.ready.then(()=>{
 if(!tracker.getConfig().heatmap)return;
 const depths=new Set<number>();let timer:ReturnType<typeof setTimeout>|undefined;tracker.onPage(()=>depths.clear());
 const emit=(kind:'click'|'scroll',x:number,y:number)=>tracker.emit('heatmap',{heatmap:{kind,x:Math.max(0,Math.min(1,Math.round(x*100)/100)),y:Math.max(0,Math.min(1,Math.round(y*100)/100)),width:innerWidth,height:innerHeight}});
 document.addEventListener('click',e=>{if(!tracker.isAllowed()||!(e.target instanceof Element)||e.target.closest('input,textarea,select,[contenteditable],.baize-private,[data-baize-private]'))return;emit('click',e.pageX/Math.max(1,document.documentElement.scrollWidth),e.pageY/Math.max(1,document.documentElement.scrollHeight));});
 document.addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!tracker.isAllowed())return;const depth=(scrollY+innerHeight)/Math.max(1,document.documentElement.scrollHeight);for(const threshold of [.25,.5,.75,1])if(depth>=threshold&&!depths.has(threshold)){depths.add(threshold);emit('scroll',.5,threshold);}},200);},{passive:true});
});
