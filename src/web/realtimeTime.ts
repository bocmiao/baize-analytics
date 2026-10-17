import type {Row} from './api';

/** HTTP PostgreSQL timestamps are ISO strings; SSE/PHP may send epoch ms.
 * ClickHouse DateTime64 JSON has a UTC date-time without a zone suffix. */
export function realtimeTimestamp(value:unknown):number|null{
 let stamp:number;
 if(typeof value==='number')stamp=value;
 else if(value instanceof Date)stamp=value.getTime();
 else if(typeof value==='string'&&value.trim()){
  const text=value.trim();
  if(/^\d+(?:\.\d+)?$/.test(text))stamp=Number(text);
  else if(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text))stamp=Date.parse(text.replace(' ','T')+'Z');
  else if(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text))stamp=Date.parse(text);
  else return null;
 }else return null;
 return Number.isFinite(stamp)&&stamp>0&&Number.isFinite(new Date(stamp).getTime())?stamp:null;
}
export function minuteBuckets(events:Row[]){
 const stamps=events.map(event=>realtimeTimestamp(event.ts)).filter((value):value is number=>value!==null);
 if(!stamps.length)return [];
 const end=Math.floor(Math.max(...stamps)/60000)*60000,start=end-29*60000;
 const buckets=Array.from({length:30},(_,index)=>({index,count:0}));
 for(const ts of stamps){const slot=Math.floor((ts-start)/60000);if(slot>=0&&slot<30)buckets[slot]!.count++;}
 return buckets;
}
