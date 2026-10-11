import type {PoolClient} from 'pg';
/** Receipt metadata only. Caller retains transaction, header lock and verified CH fence. */
export interface RemainingFactMember {
 run_id:string;kind:string;row_key:string;batch_id:string;body_hash:string;visitor_id:string;
 interval_from:string;interval_to:string;session_id:string;anchor_event_id:string|null;
 last_event_id:string|null;anchor_ts:string|null;anchor_page_id:string|null;orphan:boolean|null;
}
export class RemainingFactMembersError extends Error {
 constructor(readonly code:'REMAINING_FACT_MEMBER_SCOPE'|'REMAINING_FACT_MEMBER_COUNT'){super(code);this.name='RemainingFactMembersError';}
}
export async function insertRemainingFactMembers(client:PoolClient,rows:RemainingFactMember[]):Promise<void>{
 if(rows.length>100)throw new RemainingFactMembersError('REMAINING_FACT_MEMBER_SCOPE');
 if(!rows.length)return;
 const result=await client.query(`INSERT INTO analytics_remaining_fact_members
 (run_id,kind,row_key,batch_id,body_hash,visitor_id,interval_from,interval_to,session_id,anchor_event_id,last_event_id,anchor_ts,anchor_page_id,orphan)
 SELECT run_id,kind,row_key,batch_id,body_hash,visitor_id,interval_from,interval_to,session_id,anchor_event_id,last_event_id,anchor_ts,anchor_page_id,orphan
 FROM jsonb_to_recordset($1::jsonb) AS r(run_id uuid,kind text,row_key text,batch_id uuid,body_hash text,visitor_id text,interval_from timestamptz,interval_to timestamptz,session_id uuid,anchor_event_id uuid,last_event_id uuid,anchor_ts timestamptz,anchor_page_id uuid,orphan boolean)`,[JSON.stringify(rows)]);
 if(result.rowCount!==rows.length)throw new RemainingFactMembersError('REMAINING_FACT_MEMBER_COUNT');
}
