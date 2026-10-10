import type {PoolClient} from 'pg';
import {measurePerformanceStage} from './performance-observation.js';
export interface FactMemberReceipt {run_id:string;kind:'effects'|'vitals';row_key:string;batch_id:string;body_hash:string;visitor_id:string;event_ts:string|Date;session_id:string;event_id:string}
/** Called only after CH readback and fresh fence, under the existing header
 * lock and transaction. Ordinary PK/FK errors abort; no conflict suppression. */
export async function insertFreshFactMembers(client:PoolClient,rows:readonly FactMemberReceipt[]):Promise<void>{
 if(rows.length<1||rows.length>100)throw Error('FACT_STORE_STAGE_SCOPE');
 const inserted=await measurePerformanceStage('manifest_sql',()=>client.query(`INSERT INTO analytics_fact_store_members(run_id,kind,row_key,batch_id,body_hash,visitor_id,event_ts,session_id,event_id) SELECT run_id,kind,row_key,batch_id,body_hash,visitor_id,event_ts,session_id,event_id FROM jsonb_to_recordset($1::jsonb) AS r(run_id uuid,kind text,row_key text,batch_id uuid,body_hash text,visitor_id text,event_ts timestamptz,session_id uuid,event_id uuid)`,[JSON.stringify(rows)]),{adapter:'facts'});
 if(inserted.rowCount!==rows.length)throw Error('FACT_STORE_MEMBER_PUBLICATION_COUNT');
}
