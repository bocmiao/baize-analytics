const assert=require('node:assert/strict');
global.window={};require('./shared/data.js');
let assertions=0;const check=(condition,message)=>{assert(condition,message);assertions++;};
for(const period of [7,30]){
 const d=window.BaizeDemo.view(period);
 check(d.current.length===period&&d.previous.length===period,'window lengths');
 check(d.current.at(-1).date==='2026-10-10','fixed final date');
 check(d.previous.at(-1).date<d.current[0].date,'previous non-overlap');
 check(d.current.reduce((s,x)=>s+x.pv,0)===d.totals.pv,'daily PV');
 check(new Set(d.current.flatMap(x=>x.visitors)).size===d.totals.uv,'window UV distinct');
 check(d.current.reduce((s,x)=>s+x.conversions,0)===d.totals.conversions,'conversion events');
 check(d.sources.reduce((s,x)=>s+x.pv,0)===d.totals.pv,'source PV');
 check(d.pages.reduce((s,x)=>s+x.pv,0)===d.totals.pv,'landing PV');
 check(d.pages.reduce((s,x)=>s+x.conversions,0)===d.totals.conversions,'landing conversions');
 check(d.heat.length===7&&d.heat.every(row=>row.length===24),'heat 7 by 24');
 check(d.heat.flat().reduce((s,x)=>s+x,0)===d.totals.pv,'heat total PV');
 check(d.funnel[0].value===d.totals.uv&&d.funnel.at(-1).value===d.totals.converted,'funnel endpoints');
 check(d.funnel.every((step,i)=>!i||step.value<=d.funnel[i-1].value),'monotonic funnel');
 check(d.annotations.length>0&&d.annotations.every(a=>a.date>=d.current[0].date&&a.date<=d.current.at(-1).date),'annotations within window');
 check(d.totals.rate===d.totals.converted/d.totals.uv*100,'rate denominator');
}
for(const period of [7,30])for(const source of window.BaizeDemo.sources)for(const page of [undefined,...window.BaizeDemo.pages]){
 const d=window.BaizeDemo.view(period,{source,page});
 check(d.sources.reduce((s,x)=>s+x.pv,0)===d.totals.pv,'filtered source partition');
 check(d.pages.reduce((s,x)=>s+x.pv,0)===d.totals.pv,'filtered page partition');
 check(d.heat.flat().reduce((s,x)=>s+x,0)===d.totals.pv,'filtered heat partition');
 check(new Set(d.current.flatMap(x=>x.visitors)).size===d.totals.uv,'filtered distinct visitor');
 check(d.pages.reduce((s,x)=>s+x.conversions,0)===d.totals.conversions,'filtered conversion partition');
}
console.log(JSON.stringify({passed:assertions,failed:0,dataset:window.BaizeDemo.version,scope:'synthetic prototype data only'}));
