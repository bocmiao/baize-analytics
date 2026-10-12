/** Resolve the first representable instant of a civil day in an IANA zone. */
export function midnight(date:string,timeZone:string):number {
 const [year,month,day]=date.split('-').map(Number);const desired=Date.UTC(year!,month!-1,day!);let instant=desired;const candidates=[instant];
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const civilDay=(value:number)=>{const parts=Object.fromEntries(formatter.formatToParts(value).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}`;};
 const firstInstant=(upper:number)=>{
  if(civilDay(upper)!==date)throw new RangeError('Civil date is not representable in this time zone');
  if(civilDay(upper-1)<date)return upper;
  let lower=upper-36*3600000;
  if(civilDay(lower)>=date)throw new RangeError('Civil day boundary is unavailable in this time zone');
  while(lower<upper){const middle=Math.floor((lower+upper)/2);if(civilDay(middle)<date)lower=middle+1;else upper=middle;}
  return lower;
 };
 for(let i=0;i<4;i++){const parts=Object.fromEntries(formatter.formatToParts(instant).map(p=>[p.type,p.value]));const civil=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));const delta=desired-civil;if(delta===0)return firstInstant(instant);instant+=delta;candidates.push(instant);}
 // A missing midnight can make offset iteration oscillate across the date
 // boundary. A repeated midnight can resolve to the later occurrence. Both
 // cases use the first civil-day instant; a completely skipped date rejects.
 return firstInstant(Math.max(...candidates));
}

export function dateRange(from:string,to:string,timeZone:string):string {
 const begin=midnight(from,timeZone);if(to!==from)midnight(to,timeZone);
 const next=new Date(`${to}T12:00:00Z`);
 // Selected dates must exist. Only their exclusive boundary may skip a civil
 // date that a zone omitted entirely (for example Apia's 2011-12-30).
 for(let i=0;i<3;i++){
  next.setUTCDate(next.getUTCDate()+1);
  try{return new URLSearchParams({from:new Date(begin).toISOString(),to:new Date(midnight(next.toISOString().slice(0,10),timeZone)).toISOString()}).toString();}
  catch(error){if(!(error instanceof RangeError)||error.message!=='Civil date is not representable in this time zone')throw error;}
 }
 throw new RangeError('Civil day boundary is unavailable in this time zone');
}
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
