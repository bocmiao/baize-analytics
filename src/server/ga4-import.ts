import {z} from 'zod';
import {ExternalError} from './external-errors.js';
import type {Transport} from './outbound.js';
const metrics=['screenPageViews','totalUsers','sessions'];
const rowSchema=z.object({dimensionValues:z.array(z.object({value:z.string().max(512)})),metricValues:z.array(z.object({value:z.string().regex(/^\d+$/).transform(Number).refine(Number.isSafeInteger)})).length(3)});
const metadataSchema=z.object({timeZone:z.string().max(100).optional(),subjectToThresholding:z.boolean().optional(),dataLossFromOtherRow:z.boolean().optional(),samplingMetadatas:z.array(z.object({samplesReadCount:z.string().max(30).regex(/^\d+$/),samplingSpaceSize:z.string().max(30).regex(/^\d+$/)})).max(10).optional()});
export interface GaMetrics{pv:number;totalUsers:number;sessions:number}
export interface GaRow extends GaMetrics{dimensions:string[]}
export interface GaReport{rows:GaRow[];metadata:z.infer<typeof metadataSchema>[];rowCount:number|null}
export interface GaWindow{requestedCoverage:{start:string;end:string};userMetric:'totalUsers';source:'GA4 Data API';reports:Record<'sourceDays'|'days'|'weeks'|'period'|'sources',GaReport>;propertyTimezone:string|null;quality:'limited'|'provider-reported'|'unknown'}
function invalid():never{throw new ExternalError('external_response_invalid');}
export function gaRange(start:string,end:string){if(!z.iso.date().safeParse(start).success||!z.iso.date().safeParse(end).success||start>end||(Date.parse(end)-Date.parse(start))/86400000>3660)throw new ExternalError('external_config_invalid');}
function day(value:string,start:string,end:string){if(!/^\d{8}$/.test(value))invalid();const d=`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6)}`;if(!z.iso.date().safeParse(d).success||d<start||d>end)invalid();}
export function gaWeekBounds(value:string,start:string,end:string){if(!/^\d{6}$/.test(value))invalid();const year=Number(value.slice(0,4)),week=Number(value.slice(4));if(year<1900||year>9999||week<1||week>53)invalid();const jan=new Date(Date.UTC(year,0,4));jan.setUTCDate(jan.getUTCDate()-((jan.getUTCDay()+6)%7)+(week-1)*7);const thursday=new Date(jan);thursday.setUTCDate(thursday.getUTCDate()+3);if(thursday.getUTCFullYear()!==year)invalid();const last=new Date(jan);last.setUTCDate(last.getUTCDate()+6);const first=jan.toISOString().slice(0,10),final=last.toISOString().slice(0,10);if(final<start||first>end)invalid();return {start:first<start?start:first,end:final>end?end:final};}
async function report(token:string,property:string,start:string,end:string,dimensions:string[],transport:Transport):Promise<GaReport>{
 const rows:GaRow[]=[],seen=new Set<string>(),metadata:GaReport['metadata']=[];let rowCount:number|null=null;
 for(let offset=0;offset<=100000;){
  const response=await transport(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},maxBytes:5_000_000,body:JSON.stringify({dateRanges:[{startDate:start,endDate:end}],dimensions:dimensions.map(name=>({name})),metrics:metrics.map(name=>({name})),offset,limit:10000,orderBys:dimensions.map(dimensionName=>({dimension:{dimensionName}}))})});
  if(response.status!==200)throw new ExternalError('external_provider_failed');let json:Record<string,unknown>;try{json=JSON.parse(response.text);if(!json||Array.isArray(json)||typeof json!=='object')invalid();}catch{invalid();}
  const batch=z.array(rowSchema).max(10000).safeParse(json.rows??[]);if(!batch.success)invalid();
  if(json.rowCount!==undefined){if(!Number.isSafeInteger(json.rowCount)||Number(json.rowCount)<0)invalid();if(Number(json.rowCount)>100000)throw new ExternalError('external_response_too_large');if(rowCount!==null&&rowCount!==json.rowCount)invalid();rowCount=Number(json.rowCount);}
  for(const [field,names] of [['dimensionHeaders',dimensions],['metricHeaders',metrics]] as const){if(json[field]!==undefined){const parsed=z.array(z.object({name:z.string()})).safeParse(json[field]);if(!parsed.success||JSON.stringify(parsed.data.map(x=>x.name))!==JSON.stringify(names))invalid();}}
  if(json.metadata!==undefined){const m=metadataSchema.safeParse(json.metadata);if(!m.success)invalid();if(m.data.timeZone){try{new Intl.DateTimeFormat('en',{timeZone:m.data.timeZone});}catch{invalid();}}metadata.push(m.data);}
  for(const r of batch.data){if(r.dimensionValues.length!==dimensions.length)invalid();const values=r.dimensionValues.map(x=>x.value);for(let i=0;i<dimensions.length;i++){if(dimensions[i]==='date')day(values[i]!,start,end);if(dimensions[i]==='isoYearIsoWeek')gaWeekBounds(values[i]!,start,end);}const key=JSON.stringify(values);if(seen.has(key))invalid();seen.add(key);rows.push({dimensions:values,pv:r.metricValues[0]!.value,totalUsers:r.metricValues[1]!.value,sessions:r.metricValues[2]!.value});}
  if(rows.length>100000)throw new ExternalError('external_response_too_large');offset+=batch.data.length;
  if(rowCount!==null){if(rows.length>rowCount||!batch.data.length&&rows.length<rowCount)invalid();if(rows.length===rowCount)break;}else if(batch.data.length<10000)break;
 }
 if(!dimensions.length&&rows.length>1)invalid();return {rows,metadata,rowCount};
}
export async function fetchGaWindow(token:string,property:string,start:string,end:string,transport:Transport):Promise<GaWindow>{
 gaRange(start,end);if(!/^\d{1,30}$/.test(property??''))throw new ExternalError('external_config_invalid');
 const reports={} as GaWindow['reports'];for(const [key,dimensions] of [['sourceDays',['date','sessionSource']],['days',['date']],['weeks',['isoYearIsoWeek']],['period',[]],['sources',['sessionSource']]] as const)reports[key]=await report(token,property,start,end,[...dimensions],transport);
 const meta=Object.values(reports).flatMap(r=>r.metadata),zones=new Set(meta.map(m=>m.timeZone).filter(Boolean));if(zones.size>1)invalid();return {requestedCoverage:{start,end},userMetric:'totalUsers',source:'GA4 Data API',reports,propertyTimezone:zones.values().next().value??null,quality:meta.some(m=>m.subjectToThresholding||m.dataLossFromOtherRow||m.samplingMetadatas?.some(s=>BigInt(s.samplesReadCount)<BigInt(s.samplingSpaceSize)))?'limited':Object.values(reports).every(r=>r.metadata.length>0)?'provider-reported':'unknown'};
}
