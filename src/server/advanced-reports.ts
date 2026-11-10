import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {AppContext} from './context.js';
import {contentFilterSchema} from './analytics-core.js';
import {readSiteEvents} from './event-store.js';
import {withStatsReadSnapshot} from './stats-read-snapshot.js';
import {readEventDefinitions} from './event-management.js';
import {eventAnalysis,heatmapAnalysis} from './advanced-report-model.js';
const rangeSchema=contentFilterSchema.extend({from:z.iso.datetime(),to:z.iso.datetime(),names:z.preprocess(value=>typeof value==='string'?[value]:value,z.array(z.string().min(1).max(128)).max(5)).optional(),event:z.string().min(1).max(128).optional(),kind:z.enum(['click','scroll']).optional(),viewport:z.coerce.number().int().min(0).max(20000).optional()}).refine(value=>Date.parse(value.to)>Date.parse(value.from)&&Date.parse(value.to)-Date.parse(value.from)<=90*86400000,'请选择不超过90天的有效范围');
export function registerAdvancedReports(app:FastifyInstance,ctx:AppContext){
 for(const type of ['event-analysis','heatmap-analysis'] as const)app.get(`/api/v1/sites/:siteId/${type}`,async req=>{
  const {siteId}=req.params as {siteId:string};await ctx.authorize(req,siteId);const query=rangeSchema.parse(req.query),to=new Date(Math.min(Date.now(),Date.parse(query.to))).toISOString(),filters=contentFilterSchema.parse(query);
  const snapshot=await withStatsReadSnapshot(ctx,siteId,query.from,to,async client=>{
   const site=(await client.query('SELECT timezone,privacy_mode,config FROM sites WHERE id=$1',[siteId])).rows[0];if(!site)throw Object.assign(Error('站点不存在'),{statusCode:404});
   const frontier=(await client.query('SELECT retired_before FROM analytics_raw_retirement_frontiers WHERE site_id=$1',[siteId])).rows[0]?.retired_before;
   const unavailable=(status:string)=>({from:query.from,to,timezone:site.timezone,status,coverage:0,events:[],trend:[],selectedNames:query.names||[],properties:[],points:[],definitions:readEventDefinitions(site.config)});
   if(Date.parse(query.from)>=Date.parse(to))return unavailable('future_only');if(frontier&&+new Date(frontier)>Date.parse(query.from))return unavailable('raw_detail_retired');
   const read=await readSiteEvents(ctx.pool,siteId,{from:new Date(query.from),to:new Date(to),type:type==='heatmap-analysis'?'heatmap':undefined,client,statsMirrorRead:true,limit:100000,order:'asc'});
   if(read.coverage!==1||read.truncated)return unavailable(read.truncated?'detail_limit_exceeded':read.rangeStatus||'detail_unavailable');
   const range={from:query.from,to,timezone:site.timezone,privacy:site.privacy_mode!=='standard',filters};
   const available=type==='heatmap-analysis'?{availablePaths:[...new Set(read.events.filter(event=>event.type==='heatmap').map(event=>event.path))].sort(),availableViewports:[...new Set(read.events.filter(event=>event.type==='heatmap').map(event=>Math.round(Number((event.payload.heatmap as Record<string,unknown>)?.width)/100)*100).filter(Number.isFinite))].sort((a,b)=>a-b)}:{};
   const result=type==='event-analysis'?eventAnalysis(read.events,range,query.names,query.event):heatmapAnalysis(read.events,range,query);
   return {...result,...available,from:query.from,to,timezone:site.timezone,status:'complete',coverage:1,definitions:readEventDefinitions(site.config),coordinateSystem:type==='heatmap-analysis'?'document_percent':undefined};
  });return {...snapshot.value,aggregationPending:snapshot.dirty};
 });
}
