/* Deterministic synthetic preview only. No collection, API, cookies or external resources. */
(function () {
  'use strict';
  const start = Date.UTC(2026,7,12), names=['自然搜索','直接访问','外部推荐','社交媒体','邮件活动'];
  const sourceWeights=[.42,.28,.16,.09,.05], pages=['/产品/白泽分析','/指南/快速开始','/','/文章/隐私与数据','/价格'];
  const allocations=(total,weights)=>{const out=weights.map(w=>Math.floor(total*w));for(let i=0;out.reduce((a,b)=>a+b,0)<total;i++)out[i%out.length]++;return out;};
  const days=Array.from({length:60},(_,i)=>{
    const date=new Date(start+i*86400000).toISOString().slice(0,10);
    const visitors=Array.from({length:480},(_,v)=>v).filter(v=>(v*17+i*11)%100 < 29+(i%7)*3+(i>=30?9:0));
    const converted=visitors.filter(v=>(v*13+i*7)%43===0);
    const pv=visitors.length*3+90+((i*71)%137), conversions=converted.length+Math.floor(converted.length/3);
    return {date,pv,uv:visitors.length,conversions,visitors,converted};
  });
  function aggregate(rows){const uv=new Set(rows.flatMap(d=>d.visitors)).size, converted=new Set(rows.flatMap(d=>d.converted)).size;return {pv:rows.reduce((s,d)=>s+d.pv,0),uv,conversions:rows.reduce((s,d)=>s+d.conversions,0),converted,rate:converted/uv*100};}
  const group=(v,weights,multiplier)=>{let at=(v*multiplier)%100;for(let i=0;i<weights.length;i++){at-=weights[i]*100;if(at<0)return i;}return weights.length-1;};
  const pageWeights=[.34,.25,.19,.14,.08];
  function classify(v){return {source:group(v,sourceWeights,7),page:group(v,pageWeights,31)};}
  function project(day,filters){const counts=new Map(day.visitors.map((v,i)=>[v,Math.floor(day.pv/day.uv)+(i<day.pv%day.uv?1:0)]));const visitors=day.visitors.filter(v=>{const c=classify(v);return (!filters.source||names[c.source]===filters.source)&&(!filters.page||pages[c.page]===filters.page);});const allowed=new Set(visitors),converted=day.converted.filter(v=>allowed.has(v));const duplicates=new Set(day.converted.slice(0,Math.floor(day.converted.length/3)));const sources=names.map(()=>0),pagePV=pages.map(()=>0),pageConversions=pages.map(()=>0);for(const v of visitors){const c=classify(v);sources[c.source]+=counts.get(v);pagePV[c.page]+=counts.get(v);}for(const v of converted)pageConversions[classify(v).page]+=1+(duplicates.has(v)?1:0);return {...day,visitors,converted,pv:visitors.reduce((n,v)=>n+counts.get(v),0),uv:visitors.length,conversions:pageConversions.reduce((a,b)=>a+b,0),sourcePV:sources,pagePV,pageConversions};}
  function view(period=7,filters={}){if(![7,30].includes(period))throw Error('Unsupported period');if(filters.source&&!names.includes(filters.source)||filters.page&&!pages.includes(filters.page))throw Error('Unsupported filter');const current=days.slice(60-period).map(d=>project(d,filters)),previous=days.slice(60-period*2,60-period).map(d=>project(d,filters)),totals=aggregate(current),prior=aggregate(previous);totals.rate=totals.uv?totals.converted/totals.uv*100:0;prior.rate=prior.uv?prior.converted/prior.uv*100:0;
    const sourceCounts=names.map((_,i)=>current.reduce((n,d)=>n+d.sourcePV[i],0)),pageCounts=pages.map((_,i)=>current.reduce((n,d)=>n+d.pagePV[i],0)),convCounts=pages.map((_,i)=>current.reduce((n,d)=>n+d.pageConversions[i],0));
    const heat=Array.from({length:7},()=>Array(24).fill(0));current.forEach(d=>{const weekday=(new Date(d.date+'T00:00:00Z').getUTCDay()+6)%7;const w=Array.from({length:24},(_,h)=>h>=9&&h<19?5+(h%3):h>=7&&h<23?2:1),n=w.reduce((a,b)=>a+b,0);allocations(d.pv,w.map(x=>x/n)).forEach((v,h)=>heat[weekday][h]+=v);});
    const browse=Math.max(totals.converted,Math.round(totals.uv*.73)),checkout=Math.max(totals.converted,Math.round(totals.uv*.36));
    return {period,filters:{...filters},current,previous,totals,prior,sources:names.map((name,i)=>({name,pv:sourceCounts[i],share:totals.pv?sourceCounts[i]/totals.pv*100:0})),pages:pages.map((path,i)=>({path,pv:pageCounts[i],share:totals.pv?pageCounts[i]/totals.pv*100:0,conversions:convCounts[i],rate:pageCounts[i]?convCounts[i]/pageCounts[i]*100:0})),funnel:[{name:'访问站点',value:totals.uv},{name:'浏览产品',value:browse},{name:'开始注册',value:checkout},{name:'完成注册',value:totals.converted}],heat,annotations:[{date:'2026-10-05',title:'接入指南更新',note:'人工备注；仅记录时间，不说明因果关系。'},{date:'2026-09-24',title:'首页内容调整',note:'人工备注；未测量实验收益。'}].filter(a=>a.date>=current[0].date),range:current[0].date+' — '+current.at(-1).date,timezone:'Asia/Shanghai'};
  }
  window.BaizeDemo=Object.freeze({view,aggregate,sources:names,pages,format:n=>new Intl.NumberFormat('zh-CN').format(n),version:'deterministic-v2-2026-10-10',disclosure:'确定性演示数据 · 非真实网站结果',metricLabels:{pv:'浏览量 PV',uv:'每日访客 UV',conversions:'转化事件'},metricUnits:{pv:'次浏览',uv:'人 / 日',conversions:'次转化'}});
})();
