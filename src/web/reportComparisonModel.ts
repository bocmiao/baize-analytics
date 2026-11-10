import {rows,type Row} from './api';
import {civilDate,inclusiveEnd} from './time';
import {labelText} from './trafficModel';

/** Date positions belong to the requested civil calendar, not to days that
 * happen to contain traffic. UTC increments here advance date labels only. */
export function comparisonCalendar(query:string,timezone:string):string[]{
 const params=new URLSearchParams(query),first=civilDate(params.get('from')!,timezone),last=inclusiveEnd(params.get('to')!,timezone),dates:string[]=[];
 for(let date=first;date<=last&&dates.length<368;date=new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10))dates.push(date);
 return dates;
}
const trendRows=(data:Row|undefined,dimension:string)=>rows((data?.dimensionTrend as Row|undefined)?.[dimension]);
const groupKey=(row:Row)=>String(row.ipKey??row.label);
export function comparisonSelection(data:Row|undefined,dimension:string){return [...new Set(trendRows(data,dimension).map(groupKey))].slice(0,5);}
export function buildTrendComparison(current:Row|undefined,previous:Row|undefined,query:string,previousQuery:string|null,timezone:string,dimension:string,metric:string){
 const trend=trendRows(current,dimension),prior=trendRows(previous,dimension),times=comparisonCalendar(query,timezone),priorTimes=previousQuery?comparisonCalendar(previousQuery,timezone):[];
 const selected=[...new Map(trend.map(row=>[groupKey(row),String(row.label)])).entries()];
 const value=(data:Row|undefined,list:Row[],time:string|undefined,key:string)=>{if(data?.coverage!==1)return null;const result=list.find(row=>row.time===time&&groupKey(row)===key)?.[metric];return typeof result==='number'&&Number.isFinite(result)?result:null;};
 return {times,series:selected.flatMap(([key,label])=>[{name:labelText(label),values:times.map(time=>value(current,trend,time,key))},...(previousQuery&&previous?.coverage===1?[{name:labelText(label)+' · 对比期',values:times.map((_time,index)=>value(previous,prior,priorTimes[index],key))}]:[])])};
}
