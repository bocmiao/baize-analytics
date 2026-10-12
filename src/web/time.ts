/** Resolve civil midnight in an IANA time zone, including DST transitions. */
export function midnight(date:string,timeZone:string):number {
 const [year,month,day]=date.split('-').map(Number);const desired=Date.UTC(year!,month!-1,day!);let instant=desired;
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 for(let i=0;i<4;i++){const parts=Object.fromEntries(formatter.formatToParts(instant).map(p=>[p.type,p.value]));const civil=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));const delta=desired-civil;if(delta===0)return instant;instant+=delta;}
 return instant;
}
export function dateRange(from:string,to:string,timeZone:string):string {const next=new Date(`${to}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+1);return new URLSearchParams({from:new Date(midnight(from,timeZone)).toISOString(),to:new Date(midnight(next.toISOString().slice(0,10),timeZone)).toISOString()}).toString();}
export function civilDate(instant:string,timeZone:string):string {return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(instant));}

/** Calendar endpoints exposed to inclusive daily APIs. */
export function inclusiveEnd(to:string,timeZone:string):string {return civilDate(new Date(+new Date(to)-1).toISOString(),timeZone);}
export function previousDateRange(query:string,timeZone:string):string {
 const q=new URLSearchParams(query),first=civilDate(q.get('from')!,timeZone),last=inclusiveEnd(q.get('to')!,timeZone);
 const days=Math.round((Date.parse(last)-Date.parse(first))/86400000)+1;
 const shifted=(daysBack:number)=>new Date(Date.parse(first)-daysBack*86400000).toISOString().slice(0,10);
 const previous=new URLSearchParams(dateRange(shifted(days),shifted(1),timeZone));
 q.set('from',previous.get('from')!);q.set('to',previous.get('to')!);return q.toString();
}
