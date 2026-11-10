import {stripInternalIPDimensions} from './network-ip.js';
import type {PoolClient} from 'pg';
import type {AppContext} from './context.js';
import {readSiteEvents} from './event-store.js';
import type {StoredEvent} from './clickhouse-store.js';
/** Top lists use the complete bounded 30-minute PV window, never the 200-row stream preview. */
export async function queryRealtime(ctx:Pick<AppContext,'pool'>,siteId:string,options:{maxRows?:number;client?:PoolClient}={}){
 const db=options.client??ctx.pool;
 const maxRows=options.maxRows??100000;if(!Number.isInteger(maxRows)||maxRows<1||maxRows>100000)throw Error('invalid_realtime_limit');
 const now=Date.now(),from=new Date(now-30*60000),to=new Date(now),onlineFrom=new Date(now-5*60000);
 const before=(await db.query('SELECT generation::text,epoch::text FROM aggregation_state WHERE site_id=$1',[siteId])).rows[0];
 const reads=[()=>readSiteEvents(ctx.pool,siteId,{from,to,order:'desc',limit:200,client:options.client}),()=>readSiteEvents(ctx.pool,siteId,{from,to,type:'pageview',limit:maxRows,client:options.client}),()=>readSiteEvents(ctx.pool,siteId,{from:onlineFrom,to,type:'heartbeat',limit:maxRows,client:options.client})];
 const [preview,activity,heartbeat]=options.client?[await reads[0]!(),await reads[1]!(),await reads[2]!()]:await Promise.all([reads[0]!(),reads[1]!(),reads[2]!()]);
 const after=(await db.query('SELECT generation::text,epoch::text FROM aggregation_state WHERE site_id=$1',[siteId])).rows[0];
 const changed=before?.generation!==after?.generation||before?.epoch!==after?.epoch;
 const complete=!changed&&activity.coverage===1&&!activity.truncated;const onlineComplete=!changed&&heartbeat.coverage===1&&!heartbeat.truncated;
 function group(keys:(event:StoredEvent)=>Record<string,string>){const groups=new Map<string,{dimensions:Record<string,string>;pv:number;visitors:Set<string>}>();for(const event of activity.events){const dimensions=keys(event),key=JSON.stringify(dimensions);let row=groups.get(key);if(!row){row={dimensions,pv:0,visitors:new Set()};groups.set(key,row);}row.pv++;row.visitors.add(event.visitor_id);}return [...groups.values()].sort((a,b)=>b.pv-a.pv||JSON.stringify(a.dimensions).localeCompare(JSON.stringify(b.dimensions))).slice(0,20).map(row=>({...row.dimensions,pv:row.pv,uv:row.visitors.size}));}
 const {events,...storage}=preview;
 return {online:onlineComplete?new Set(heartbeat.events.map(event=>event.visitor_id)).size:null,onlineCoverage:onlineComplete?1:0,storage,events:changed?[]:events.map(event=>({event_id:event.event_id,ts:event.ts,type:event.type,path:event.path,dimensions:stripInternalIPDimensions(event.dimensions)})),topPages:complete?group(event=>({path:event.path})):null,topSources:complete?group(event=>({channel:event.dimensions.channel||'unknown',referrer:event.dimensions.referrer||''})):null,topGeography:complete?group(event=>({country:event.dimensions.country||'unknown',region:event.dimensions.region||'unknown',city:event.dimensions.city||'unknown'})):null,realtime:{status:changed?'source_changed':complete?'complete':'partial_unavailable',coverage:complete?1:0,from:from.toISOString(),to:to.toISOString(),onlineFrom:onlineFrom.toISOString(),method:'exact_distinct_pageview_window',pv:complete?activity.events.length:null,limit:maxRows,truncated:activity.truncated||heartbeat.truncated||false,topStorage:{source:activity.source,mode:activity.mode,fallbackReason:activity.fallbackReason},onlineStorage:{source:heartbeat.source,mode:heartbeat.mode}}};
}
