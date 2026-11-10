import {dayOf,eventMatchesFilters,type AnalyticsEvent,type ContentFilters} from './analytics-core.js';

export interface AdvancedRange {from:string;to:string;timezone:string;privacy:boolean;filters?:ContentFilters}
type Counter={count:number;visitors:Set<string>};
const blank=():Counter=>({count:0,visitors:new Set()});
const add=(counter:Counter,event:AnalyticsEvent)=>{counter.count++;counter.visitors.add(event.visitor_id);};
const metrics=(counter:Counter,unsupported=false)=>({count:counter.count,uv:unsupported?null:counter.visitors.size,averageCount:unsupported?null:counter.visitors.size?counter.count/counter.visitors.size:0});
function selected(input:AnalyticsEvent[],range:AdvancedRange){return [...new Map(input.filter(event=>+new Date(event.ts)>=Date.parse(range.from)&&+new Date(event.ts)<Date.parse(range.to)&&eventMatchesFilters(event,range.filters||{})).map(event=>[event.event_id,event])).values()];}
export function eventAnalysis(input:AnalyticsEvent[],range:AdvancedRange,names:string[]=[],propertyEvent?:string){
 const events=selected(input,range).filter(event=>['event','revenue'].includes(event.type));
 const multiDay=dayOf(range.from,range.timezone)!==dayOf(new Date(Date.parse(range.to)-1),range.timezone),unsupported=range.privacy&&multiDay;
 const hourFormatter=new Intl.DateTimeFormat('en',{timeZone:range.timezone,minute:'2-digit',second:'2-digit'});
 const hour=(instant:number)=>{const parts=hourFormatter.formatToParts(instant);return instant-Number(parts.find(part=>part.type==='minute')!.value)*60000-Number(parts.find(part=>part.type==='second')!.value)*1000-((instant%1000)+1000)%1000;};
 const bucket=(instant:number)=>multiDay?dayOf(new Date(instant),range.timezone):new Date(hour(instant)).toISOString();
 const totals=new Map<string,Counter>(),buckets=new Map<string,Map<string,Counter>>(),properties=new Map<string,Counter>();
 for(let instant=hour(Date.parse(range.from));instant<Date.parse(range.to);instant+=3600000)buckets.set(bucket(instant),new Map());
 for(const event of events){const name=String(event.payload.event_name||event.type),total=totals.get(name)||blank();add(total,event);totals.set(name,total);const key=bucket(+new Date(event.ts)),group=buckets.get(key)||new Map<string,Counter>(),counter=group.get(name)||blank();add(counter,event);group.set(name,counter);buckets.set(key,group);
  if(name===propertyEvent)for(const [key,value]of Object.entries((event.payload.props||{}) as Record<string,unknown>)){if(!['string','number','boolean'].includes(typeof value))continue;const id=JSON.stringify([key,typeof value,String(value)]),row=properties.get(id)||blank();add(row,event);properties.set(id,row);}
 }
 const rows=[...totals].map(([name,counter])=>({name,...metrics(counter,unsupported)})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
 const selectedNames=names.length?[...new Set(names)]:rows.slice(0,5).map(row=>row.name);
 return {events:rows,selectedNames,granularity:multiDay?'day':'hour',uvStatus:unsupported?'unsupported_in_this_mode':'supported',trend:[...buckets].sort(([a],[b])=>a.localeCompare(b)).map(([time,group])=>({time,events:Object.fromEntries(selectedNames.map(name=>[name,metrics(group.get(name)||blank())]))})),properties:[...properties].map(([id,counter])=>{const[key,valueType,value]=JSON.parse(id) as string[];return {key:key!,valueType:valueType!,value:value!,...metrics(counter,unsupported)};}).sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key)||a.value.localeCompare(b.value))};
}
export function heatmapAnalysis(input:AnalyticsEvent[],range:AdvancedRange,filter:{kind?:string;viewport?:number}={}){
 const points=new Map<string,{path:string;kind:string;x:number;y:number;viewport:number;count:number}>(),elements=new Map<string,Counter>(),dimensions=new Map<string,number>();let totalClicks=0;
 const unsupported=range.privacy&&dayOf(range.from,range.timezone)!==dayOf(new Date(Date.parse(range.to)-1),range.timezone);
 for(const event of selected(input,range)){if(event.type!=='heatmap')continue;const p=event.payload.heatmap as Record<string,unknown>|undefined;if(!p||!['click','scroll'].includes(String(p.kind))||!['x','y','width'].every(key=>typeof p[key]==='number'&&Number.isFinite(p[key])))continue;const x=Number(p.x),y=Number(p.y),width=Number(p.width);if(x<0||x>1||y<0||y>1||width<1||width>20000)continue;const row={path:event.path,kind:String(p.kind),x:Math.round(x*100),y:Math.round(y*100),viewport:Math.round(width/100)*100,count:0};if(filter.kind&&row.kind!==filter.kind||filter.viewport!==undefined&&row.viewport!==filter.viewport)continue;const key=JSON.stringify([row.path,row.kind,row.x,row.y,row.viewport]),point=points.get(key)||row;point.count++;points.set(key,point);
  if(p.document_width&&p.document_height){const key=JSON.stringify({path:event.path,width:Number(p.document_width),height:Number(p.document_height),viewport:row.viewport});dimensions.set(key,(dimensions.get(key)||0)+1);}
  if(row.kind==='click'){totalClicks++;const key=JSON.stringify([event.path,typeof p.element==='string'?p.element:'']),counter=elements.get(key)||blank();add(counter,event);elements.set(key,counter);}
 }
 return {points:[...points.values()].sort((a,b)=>a.path.localeCompare(b.path)||a.viewport-b.viewport||a.kind.localeCompare(b.kind)||a.y-b.y||a.x-b.x),elements:[...elements].map(([key,value])=>{const[path,element]=JSON.parse(key) as string[];return {path,element,...metrics(value,unsupported),share:totalClicks?value.count/totalClicks:0};}).sort((a,b)=>b.count-a.count),dimensions:[...dimensions].map(([key,count])=>({...JSON.parse(key),count})).sort((a,b)=>b.count-a.count)};
}
