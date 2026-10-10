import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {ApplicationError} from '../shared/error-codes.js';
import {TDigest} from 'tdigest';
import {dictionary,emptyBucket,singleCurrencyAmount,type Bucket} from './analytics.js';
import type {ContentFilters} from './content-analytics.js';
import {factSelection,publishedFactPredicate} from './fact-member-query.js';

function add(b:Bucket,metric:string,k:string[],n:number){
 const page=(path:string)=>b.pages[path]??={pv:0,visitors:[],visible_ms:0,entries:0,exits:0,bounces:0,completed:0};
 const segment=(key:string)=>b.segments[key]??={pv:0,visitors:[],revenue:0,revenueByCurrency:dictionary(),sessions:0,goals:dictionary()};
 const event=(name:string)=>b.events[name]??={count:0,visitors:[],properties:dictionary()};
 switch(metric){case 'pv':case 'sessions':case 'bounces':case 'duration_s':case 'visible_ms':b[metric]+=n;break;case 'page':(page(k[0]!) as unknown as Record<string,number>)[k[1]!]!+=n;break;case 'segment':(segment(k[0]!) as unknown as Record<string,number>)[k[1]!]!+=n;break;case 'source':b.sources[k[0]!]=n;break;case 'audience':(b.audience[k[0]!]??=dictionary())[k[1]!]=n;break;case 'event':event(k[0]!).count=n;break;case 'property':(event(k[0]!).properties[k[1]!]??=dictionary())[k[2]!]=n;break;case 'funnelDefinition':b.funnels[k[0]!]??=Array.from({length:Number(k[1])},()=>[]);break;case 'revenue':b.revenueByCurrency[k[0]!]=n;break;case 'segmentRevenue':segment(k[0]!).revenueByCurrency[k[1]!]=n;break;case 'goal':b.goals[k[0]!]=n;break;case 'segmentGoal':segment(k[0]!).goals[k[1]!]=n;break;case 'goalAttribution':b.goalAttribution[k[0]!]=n;break;case 'path':b.paths[k[0]!]=n;break;case 'revenueAttribution':(b.revenueAttribution[k[0]!]??={amount:0,orders:0})[k[1] as 'amount']=n;break;}
}

/** Event-time numerics and filtered vitals use SQL reduction and bounded digest cursors, never raw event arrays. */
export async function queryPublishedNumericBuckets(client:PoolClient,siteId:string,from:string,to:string,filters:ContentFilters={},maxBytes=16*1024*1024):Promise<Map<string,Bucket>>{
 const selected=factSelection(from,to,filters),params=[siteId,...selected.values],buckets=new Map<string,Bucket>();let bytes=0;
 const bucket=(key:string)=>{if(buckets.size>=10000&&!buckets.has(key))throw new ApplicationError('analytics_query_limit');let b=buckets.get(key);if(!b){b=emptyBucket();buckets.set(key,b);}return b;};
 const consume=(row:unknown)=>{bytes+=Buffer.byteLength(JSON.stringify(row));if(bytes>maxBytes)throw new ApplicationError('analytics_query_limit');};
 const cursor=`numbers_${randomUUID().replaceAll('-','')}`;
 await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT date_trunc('hour',e.event_ts AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS hour,metric,key,sum(value) AS n FROM analytics_effect_facts e WHERE ${publishedFactPredicate} AND NOT member AND ${selected.sql} GROUP BY 1,metric,key ORDER BY 1,metric,key`,params);
 try{while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows;if(!rows.length)break;for(const row of rows){consume(row);add(bucket(new Date(row.hour).toISOString()),row.metric,row.key,Number(row.n));}}}finally{await client.query(`CLOSE ${cursor}`);}
 const vc=`samples_${randomUUID().replaceAll('-','')}`;await client.query(`DECLARE ${vc} NO SCROLL CURSOR FOR SELECT date_trunc('hour',e.event_ts AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS hour,event_path,metric,value FROM analytics_vital_samples e WHERE ${publishedFactPredicate} AND ${selected.sql} ORDER BY 1,event_path,metric,event_ts,event_id`,params);
 let prior:{hour:string;path:string;metric:string}|undefined,digest=new TDigest(),count=0;
 const save=()=>{if(!prior)return;digest.compress();const values=digest.toArray();consume(values);bucket(prior.hour).vitals[JSON.stringify([prior.path,prior.metric])]=values;};
 try{while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${vc}`)).rows;if(!rows.length)break;for(const row of rows){const current={hour:new Date(row.hour).toISOString(),path:String(row.event_path),metric:String(row.metric)};if(!prior||current.hour!==prior.hour||current.path!==prior.path||current.metric!==prior.metric){save();prior=current;digest=new TDigest();count=0;}digest.push(Number(row.value));if(++count%100===0)digest.compress();}}save();}finally{await client.query(`CLOSE ${vc}`);}
 for(const b of buckets.values()){b.revenue=singleCurrencyAmount(b.revenueByCurrency)??0;for(const segment of Object.values(b.segments))segment.revenue=singleCurrencyAmount(segment.revenueByCurrency)??0;}
 return buckets;
}
