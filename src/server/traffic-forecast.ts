import {dayOf,eventMatchesFilters,sessionize,type AnalyticsEvent,type ContentFilters} from './analytics-core.js';
import {countIPIdentities} from './network-ip.js';

export type ForecastMetric = 'pv'|'uv'|'ips'|'sessions';
export type ForecastTotals = Record<ForecastMetric,number|null>;
export interface ForecastPeriod {totals:ForecastTotals;coverage:number}
export interface ForecastDay extends ForecastPeriod {day:string;sameTimeTotals:ForecastTotals;sameTimeCoverage:number}
export interface ForecastCalendar {asOf:string;timezone:string;dayStart:string;dayEnd:string}
export interface ForecastInput extends ForecastCalendar {
 today:ForecastPeriod;
 history?:ForecastDay[];
 yesterday?:ForecastPeriod;
 yesterdaySameTime?:ForecastPeriod;
}
export interface ForecastMetricResult {
 value:number|null;
 status:'estimated'|'insufficient_data'|'unavailable';
 method:'historical_remaining'|'yesterday_remaining'|'run_rate'|'observed_total'|'none';
 reason:string;
 sampleDays:number;
 sampleDates:string[];
 confidence:'medium'|'low'|'none';
 interval:{lower:number;upper:number;kind:'heuristic_range'}|null;
}
const metrics:ForecastMetric[]=['pv','uv','ips','sessions'];
const hour=3600000;
const validCount=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER;
const dateShift=(day:string,days:number)=>new Date(Date.parse(day+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
const weekday=(day:string)=>new Date(day+'T12:00:00Z').getUTCDay();
const quantile=(values:number[],q:number)=>{const sorted=[...values].sort((a,b)=>a-b),at=(sorted.length-1)*q,lo=Math.floor(at);return sorted[lo]!+(sorted[Math.ceil(at)]!-sorted[lo]!)*(at-lo);};

function calendar(input:ForecastCalendar){
 const asOf=Date.parse(input.asOf),start=Date.parse(input.dayStart),end=Date.parse(input.dayEnd);
 if(![asOf,start,end].every(Number.isFinite)||end<=start||asOf<start||asOf>end||end-start>26*hour||end-start<22*hour)throw new RangeError('Invalid forecast calendar');
 const day=dayOf(input.dayStart,input.timezone);
 if(dayOf(new Date(end-1),input.timezone)!==day||dayOf(new Date(start-1),input.timezone)===day||dayOf(input.dayEnd,input.timezone)===day)throw new RangeError('Forecast boundaries must cover one site civil day');
 return {asOf,start,end,day,elapsed:asOf-start,duration:end-start};
}

/** Local civil-time conversion. Repeated times choose the earlier occurrence;
 * missing times move forward by the DST gap. It never assumes a 24-hour day. */
function civilResolver(timezone:string){
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const civil=(instant:number)=>{const parts=Object.fromEntries(formatter.formatToParts(instant).map(p=>[p.type,p.value]));return Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second))+((instant%1000)+1000)%1000;};
 const resolve=(date:string,clock:number)=>{
  const target=Date.parse(date+'T00:00:00Z')+clock,offsets=new Set<number>();
  for(let delta=-36;delta<=36;delta+=6){const candidate=target+delta*hour;offsets.add(civil(candidate)-candidate);}
  const candidates=[...offsets].map(offset=>target-offset),exact=candidates.filter(candidate=>civil(candidate)===target).sort((a,b)=>a-b);
  if(exact.length)return exact[0]!;
  const forward=candidates.filter(candidate=>civil(candidate)>target&&dayOf(new Date(candidate),timezone)===date).sort((a,b)=>civil(a)-civil(b));
  return forward[0]??null;
 };
 return {civil,resolve};
}

export interface ForecastHistoryOptions extends ForecastCalendar {
 /** Earliest fully queried instant, excluding optional session lookback. */
 historyFrom:string;
 historyCoverage:number;
 todayCoverage?:number;
 historyDays?:number;
 privacy?:boolean;
 sessionContextComplete?:boolean;
 timeoutMs?:number;
 filters?:ContentFilters;
}

/** Deduplicate raw pageviews within each complete civil day. UV/IP are never
 * summed from hourly distinct counts. A covered day with no events is zero;
 * an unavailable/truncated period is excluded from the training sample. */
export function buildForecastHistory(input:AnalyticsEvent[],options:ForecastHistoryOptions){
 const time=calendar(options),resolver=civilResolver(options.timezone),from=Date.parse(options.historyFrom);
 if(!Number.isFinite(from)||from>time.start)throw new RangeError('Invalid forecast history start');
 const count=Math.max(0,Math.min(28,Math.floor(options.historyDays??14))),clock=time.asOf===time.end?86400000:resolver.civil(time.asOf)-Date.parse(dayOf(options.asOf,options.timezone)+'T00:00:00Z');
 const windows=new Map<string,{start:number;end:number;cutoff:number;pages:AnalyticsEvent[];samePages:AnalyticsEvent[];sessions:number;sameSessions:number;coverage:number}>();
 windows.set(time.day,{start:time.start,end:time.asOf,cutoff:time.asOf,pages:[],samePages:[],sessions:0,sameSessions:0,coverage:options.todayCoverage??options.historyCoverage});
 for(let i=1;i<=count;i++){
  const day=dateShift(time.day,-i),start=resolver.resolve(day,0),end=resolver.resolve(dateShift(day,1),0),cutoff=clock===86400000?end:resolver.resolve(day,clock);
  if(start===null||end===null||cutoff===null||start<from||end>time.start||options.historyCoverage!==1)continue;
  windows.set(day,{start,end,cutoff:Math.min(end,Math.max(start,cutoff)),pages:[],samePages:[],sessions:0,sameSessions:0,coverage:1});
 }
 const events=[...new Map(input.filter(event=>Number.isFinite(+new Date(event.ts))&&+new Date(event.ts)<time.asOf).map(event=>[event.event_id,event])).values()];
 for(const event of events){
  if(event.type!=='pageview'||!eventMatchesFilters(event,options.filters||{}))continue;
  const instant=+new Date(event.ts),window=windows.get(dayOf(event.ts,options.timezone));
  if(!window||instant<window.start||instant>=window.end)continue;
  window.pages.push(event);if(instant<window.cutoff)window.samePages.push(event);
 }
 if(options.sessionContextComplete!==false)for(const session of sessionize(events,options.timezone,options.privacy,options.timeoutMs)){
  const entry=session.events.find(event=>event.type==='pageview')!,instant=+new Date(entry.ts),window=windows.get(dayOf(entry.ts,options.timezone));
  if(!window||instant<window.start||instant>=window.end||+new Date(session.started_at)<window.start||!eventMatchesFilters(entry,options.filters||{}))continue;
  window.sessions++;if(instant<window.cutoff)window.sameSessions++;
 }
 const totals=(pages:AnalyticsEvent[],sessions:number):ForecastTotals=>({pv:pages.length,uv:new Set(pages.map(event=>event.visitor_id)).size,ips:countIPIdentities(pages,options.privacy).ips,sessions:options.sessionContextComplete===false?null:sessions});
 const todayWindow=windows.get(time.day)!;
 const today:ForecastPeriod={totals:totals(todayWindow.pages,todayWindow.sessions),coverage:todayWindow.coverage};
 const history:ForecastDay[]=[...windows].filter(([day])=>day!==time.day).map(([day,window])=>({day,totals:totals(window.pages,window.sessions),sameTimeTotals:totals(window.samePages,window.sameSessions),coverage:window.coverage,sameTimeCoverage:window.coverage})).sort((a,b)=>a.day.localeCompare(b.day));
 const yesterday=history.find(item=>item.day===dateShift(time.day,-1));
 return {today,history,yesterday:yesterday?{totals:yesterday.totals,coverage:yesterday.coverage}:undefined,yesterdaySameTime:yesterday?{totals:yesterday.sameTimeTotals,coverage:yesterday.sameTimeCoverage}:undefined};
}

/** Baize's transparent estimate, not 51.LA's unpublished forecasting model.
 * Predict remaining traffic from complete historical days and regularize the
 * same-time growth ratio by 20 observations (bounded 0.25–4). Run-rate is a
 * labelled fallback only after two hours and ten observations. Ranges describe
 * historical spread/count uncertainty; they are not calibrated confidence intervals. */
export function buildTrafficForecast(input:ForecastInput){
 const time=calendar(input),elapsedFraction=Math.min(1,time.elapsed/time.duration),details={} as Record<ForecastMetric,ForecastMetricResult>;
 const dates=new Map<string,ForecastDay>();
 for(const sample of input.history||[]){if(!/^\d{4}-\d{2}-\d{2}$/.test(sample.day)||!Number.isFinite(Date.parse(sample.day))||new Date(sample.day).toISOString().slice(0,10)!==sample.day||sample.day>=time.day||sample.day<dateShift(time.day,-28)||dates.has(sample.day))continue;dates.set(sample.day,sample);}
 const yesterdayDay=dateShift(time.day,-1);
 if(!dates.has(yesterdayDay)&&input.yesterday&&input.yesterdaySameTime)dates.set(yesterdayDay,{day:yesterdayDay,...input.yesterday,sameTimeTotals:input.yesterdaySameTime.totals,sameTimeCoverage:input.yesterdaySameTime.coverage});
 for(const key of metrics){
  const current=input.today.totals[key],unavailable=(reason:string,status:'unavailable'|'insufficient_data'='unavailable'):ForecastMetricResult=>({value:null,status,method:'none',reason,sampleDays:0,sampleDates:[],confidence:'none',interval:null});
  if(input.today.coverage!==1){details[key]=unavailable('今日数据覆盖不完整，暂不预测');continue;}
  if(!validCount(current)){details[key]=unavailable('该指标尚未采集或当前模式不支持');continue;}
  if(time.elapsed===time.duration){details[key]={value:current,status:'estimated',method:'observed_total',reason:'当日已经结束，返回实测全天值',sampleDays:0,sampleDates:[],confidence:'none',interval:{lower:current,upper:current,kind:'heuristic_range'}};continue;}
  let samples=[...dates.values()].filter(sample=>sample.coverage===1&&sample.sameTimeCoverage===1&&validCount(sample.totals[key])&&validCount(sample.sameTimeTotals[key])&&sample.sameTimeTotals[key]!<=sample.totals[key]!);
  // Empty pre-installation days cannot establish the shape of new traffic.
  if(current>0&&samples.every(sample=>sample.totals[key]===0))samples=[];
  const sameWeekday=samples.filter(sample=>weekday(sample.day)===weekday(time.day));if(sameWeekday.length>=3)samples=sameWeekday;
  let estimate:number,lower:number,upper:number,method:ForecastMetricResult['method'],reason:string;
  if(samples.length){
   const partial=quantile(samples.map(sample=>sample.sameTimeTotals[key]!),0.5),remaining=samples.map(sample=>sample.totals[key]!-sample.sameTimeTotals[key]!);
   const growth=Math.max(0.25,Math.min(4,(current+20)/(partial+20))),rest=quantile(remaining,0.5)*growth;
   estimate=current+rest;const uncertainty=Math.sqrt(Math.max(1,rest))*1.64;
   lower=current+Math.max(0,quantile(remaining,0.1)*growth-uncertainty);upper=current+quantile(remaining,0.9)*growth+uncertainty;
   method=samples.length===1&&samples[0]!.day===yesterdayDay?'yesterday_remaining':'historical_remaining';
   reason=samples.length<3?'历史样本较少，按已覆盖日期的同期与剩余流量估算':sameWeekday.length>=3?'按相同星期的同期与剩余流量估算':'按最近完整日期的同期与剩余流量估算';
  }else if(time.elapsed>=2*hour&&current>=10){
   estimate=current/elapsedFraction;const spread=1.64*Math.sqrt(current)/elapsedFraction;
   lower=Math.max(current,estimate-spread);upper=estimate+spread;method='run_rate';reason='缺少完整历史，暂按今日已运行时长估算，未考虑日内峰谷';
  }else {details[key]=unavailable(time.elapsed<2*hour?'历史不足且今日运行未满两小时，暂不外推':'历史及今日样本不足，暂不预测','insufficient_data');continue;}
  const bounded=(value:number)=>Math.min(Number.MAX_SAFE_INTEGER,Math.max(current,Math.round(value)));
  details[key]={value:bounded(estimate),status:'estimated',method,reason,sampleDays:samples.length,sampleDates:samples.map(sample=>sample.day).sort(),confidence:samples.length>=7&&time.elapsed>=2*hour&&current>=10?'medium':'low',interval:{lower:bounded(lower),upper:bounded(upper),kind:'heuristic_range'}};
 }
 const values=Object.fromEntries(metrics.map(key=>[key,details[key].value])) as ForecastTotals,estimated=metrics.filter(key=>details[key].status==='estimated');
 return {...values,status:estimated.length===metrics.length?'estimated':estimated.length?'partially_estimated':'unavailable',asOf:input.asOf,timezone:input.timezone,dayStart:input.dayStart,dayEnd:input.dayEnd,elapsedFraction,coverage:input.today.coverage,sampleDays:Math.max(...metrics.map(key=>details[key].sampleDays)),algorithm:'historical_remaining_v1',intervalKind:'heuristic_not_calibrated',details};
}
