/** Resolve civil midnight in an IANA time zone, including DST transitions. */
export function midnight(date:string,timeZone:string):number {
 const [year,month,day]=date.split('-').map(Number);const desired=Date.UTC(year!,month!-1,day!);let instant=desired;
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 for(let i=0;i<4;i++){const parts=Object.fromEntries(formatter.formatToParts(instant).map(p=>[p.type,p.value]));const civil=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));const delta=desired-civil;if(delta===0)return instant;instant+=delta;}
 return instant;
}
export function dateRange(from:string,to:string,timeZone:string):string {const next=new Date(`${to}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+1);return new URLSearchParams({from:new Date(midnight(from,timeZone)).toISOString(),to:new Date(midnight(next.toISOString().slice(0,10),timeZone)-1).toISOString()}).toString();}
export function civilDate(instant:string,timeZone:string):string {return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(instant));}
