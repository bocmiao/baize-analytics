import type {PoolClient} from 'pg';
import {measurePerformanceStage,type PerformanceCounts} from './performance-observation.js';
export interface SessionPagePathInput {visitor_id:string;component:string|number;page_id:string|null;ts:Date|string;event_id:string}
type Client=Pick<PoolClient,'query'>;
function relation(name:string){if(!/^fact_ordered_[a-f0-9]{32}$/.test(name))throw Error('SESSION_PAGE_PATH_RELATION_INVALID');return name;}
async function lookupQuery(client:Client,sql:string,args:unknown[],inputRows:number){
 const counts:PerformanceCounts={adapter:'facts',rows:0,batches:1,lookupInputRows:inputRows};
 return measurePerformanceStage('page_path_lookup',async()=>{const result=await client.query(sql,args);counts.lookupReturnedRows=result.rows.length;counts.rows=result.rows.length;return result;},counts);
}
/** Original scalar oracle: the ordered source is immutable during reduction. */
export async function lookupSessionPagePath(client:Client,ordered:string,row:SessionPagePathInput):Promise<string|undefined>{
 const result=await lookupQuery(client,`SELECT path FROM ${relation(ordered)} WHERE visitor_id=$1 AND component=$2 AND page_id=$3 AND type='pageview' AND (ts<$4 OR(ts=$4 AND event_id<=$5)) ORDER BY ts DESC,event_id DESC LIMIT 1`,[row.visitor_id,row.component,row.page_id,row.ts,row.event_id],1);
 return result.rows[0]?.path??undefined;
}
/** One bounded lookup over the same immutable TEMP source. No reducer state,
 * receipts, source authentication or fallback rules are changed. Ordinals keep
 * duplicate inputs and original event order; SQL NULL becomes the scalar miss. */
export async function lookupSessionPagePaths(client:Client,ordered:string,rows:readonly SessionPagePathInput[]):Promise<(string|undefined)[]>{
 const table=relation(ordered);if(rows.length>100)throw Error('SESSION_PAGE_PATH_BATCH_LIMIT');if(!rows.length)return [];
 const input=rows.map((row,ordinal)=>({ordinal,visitor_id:row.visitor_id,component:String(row.component),page_id:row.page_id,ts:row.ts,event_id:row.event_id}));
 const result=await lookupQuery(client,`SELECT f.ordinal,p.path FROM jsonb_to_recordset($1::jsonb) AS f(ordinal integer,visitor_id text,component bigint,page_id uuid,ts timestamptz,event_id uuid) LEFT JOIN LATERAL(SELECT path FROM ${table} WHERE visitor_id=f.visitor_id AND component=f.component AND page_id=f.page_id AND type='pageview' AND (ts<f.ts OR(ts=f.ts AND event_id<=f.event_id)) ORDER BY ts DESC,event_id DESC LIMIT 1) p ON true ORDER BY f.ordinal`,[JSON.stringify(input)],rows.length);
 if(result.rows.length!==rows.length||result.rows.some((row,index)=>row.ordinal!==index||(row.path!==null&&typeof row.path!=='string')))throw Error('SESSION_PAGE_PATH_RESULT_INVALID');
 return result.rows.map(row=>row.path??undefined);
}
