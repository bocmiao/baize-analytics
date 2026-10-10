import type {Pool,PoolClient} from 'pg';
import {withCacheReadSource} from './cache-store-source.js';
import {factReadSql} from './fact-read-context.js';
import {queryPublishedNumericBuckets} from './fact-numeric-query.js';
import {queryPublishedMembers} from './fact-member-query.js';
export interface PublishedHourCount{hour:Date;available:boolean;pv:number;uv:number}
/** Exact source-aware metrics. Control-only PG rows route to published facts;
 * their absent numeric fields are never interpreted as traffic zero. */
export async function readPublishedHourCounts(c:PoolClient,pool:Pool|undefined,site:string,hours:Date[]):Promise<PublishedHourCount[]>{
 if(hours.length>10000||hours.some(h=>!Number.isFinite(+h)||+h%3600000))throw Error('PUBLISHED_WINDOW_INVALID');if(!hours.length)return[];
 const from=new Date(Math.min(...hours.map(Number))).toISOString(),to=new Date(Math.max(...hours.map(Number))+3600000).toISOString();
 const read=async()=>{const numeric=await queryPublishedNumericBuckets(c,site,from,to),members=await queryPublishedMembers(c,site,from,to);const rows=(await c.query(factReadSql(c,"SELECT h.hour,s.data,(s.hour IS NOT NULL OR h.hour>=site.created_at) AS available FROM sites site CROSS JOIN LATERAL unnest($2::timestamptz[]) h(hour) LEFT JOIN stats_hourly s ON s.site_id=site.id AND s.hour=h.hour WHERE site.id=$1 ORDER BY h.hour DESC"),[site,hours])).rows;
 return rows.map(r=>{const key=new Date(r.hour).toISOString(),legacy=r.data&&!r.data.relationalVersion,pv=legacy?Number(r.data.pv):Number(numeric.get(key)?.pv??0),uv=members.trendUV[key]??0;if(!Number.isFinite(pv))throw Error('CACHE_BODY_INVALID');return {hour:new Date(r.hour),available:Boolean(r.available&&!r.data?.relationalUnavailable),pv,uv}})};
 return pool?withCacheReadSource(c,pool,site,read,{kinds:['hourly_rollup'],from,to}):read();
}
export async function readPublishedCalendarDays(c:PoolClient,pool:Pool|undefined,site:string,first:string,last:string,timezone:string){
 const read=async()=>{const days=(await c.query(factReadSql(c,"SELECT day::text AS day,data,day::timestamp AT TIME ZONE $4 AS start,(day+1)::timestamp AT TIME ZONE $4 AS finish FROM stats_daily WHERE site_id=$1 AND day BETWEEN $2 AND $3 ORDER BY day LIMIT 32"),[site,first,last,timezone])).rows;if(days.length>31)throw Error('PUBLISHED_WINDOW_INVALID');const rows:{day:string;pv:number;uv:number}[]=[];
 for(const d of days){if(!d.data.relationalVersion){const pv=Number(d.data.pv),uv=Array.isArray(d.data.visitors)?d.data.visitors.length:0;if(!Number.isFinite(pv))throw Error('CACHE_BODY_INVALID');rows.push({day:d.day,pv,uv});continue}
 const start=new Date(d.start).toISOString(),finish=new Date(d.finish).toISOString(),effectiveStart=new Date(Math.floor(+new Date(start)/3600000)*3600000).toISOString(),effectiveEnd=new Date(Math.ceil(+new Date(finish)/3600000)*3600000).toISOString();const exact=await queryPublishedNumericBuckets(c,site,start,finish);let pv=0;for(const bucket of exact.values())pv+=bucket.pv;const old=(await c.query(factReadSql(c,"SELECT data FROM stats_hourly WHERE site_id=$1 AND hour>=$2 AND hour<$3 AND NOT(data ? 'relationalVersion')"),[site,effectiveStart,effectiveEnd])).rows;pv+=old.reduce((n,r)=>n+Number(r.data.pv??0),0);const uv=(await queryPublishedMembers(c,site,start,finish)).uv;rows.push({day:d.day,pv,uv});}
 return rows};const bounds=(await c.query("SELECT $1::date::timestamp AT TIME ZONE $3 AS start,($2::date+1)::timestamp AT TIME ZONE $3 AS finish",[first,last,timezone])).rows[0];return pool?withCacheReadSource(c,pool,site,read,{kinds:['hourly_rollup','daily_rollup'],from:new Date(bounds.start).toISOString(),to:new Date(bounds.finish).toISOString()}):read();
}
