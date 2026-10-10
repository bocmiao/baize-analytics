import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {SessionEventHeaderRecord} from './session-event-headers.js';
import type {RemainingFactRecord} from './remaining-fact-record.js';
/** Caller supplies only the authenticated 043 published reader or the dedicated
 * completed-producer reader with a live fence. No PG-body/proposal stream. */
export async function prepareRemainingHeaderOwnership(client:PoolClient,runId:string,authenticated:AsyncIterable<SessionEventHeaderRecord[]>){
 const relation='remaining_header_owner_'+randomUUID().replaceAll('-','');await client.query(`CREATE TEMP TABLE ${relation}(session_id uuid NOT NULL,visitor_id text NOT NULL,first_ts timestamptz NOT NULL,last_ts timestamptz NOT NULL,PRIMARY KEY(session_id,visitor_id)) ON COMMIT DROP`);
 try{for await(const batch of authenticated){if(batch.length>100)throw Error('REMAINING_FACT_HEADER_OWNER_LIMIT');for(const row of batch){if(row.run_id!==runId)throw Error('REMAINING_FACT_HEADER_OWNER_SCOPE');await client.query(`INSERT INTO ${relation} VALUES($1,$2,$3,$3) ON CONFLICT(session_id,visitor_id)DO UPDATE SET first_ts=LEAST(${relation}.first_ts,excluded.first_ts),last_ts=GREATEST(${relation}.last_ts,excluded.last_ts)`,[row.session_id,row.visitor_id,row.event_ts])}}
 return {relation,verify:async(record:RemainingFactRecord)=>{if(record.row.run_id!==runId)throw Error('REMAINING_FACT_HEADER_OWNER_SCOPE');const rows=(await client.query(`SELECT visitor_id,first_ts,last_ts FROM ${relation} WHERE session_id=$1 LIMIT 2`,[record.sessionId])).rows;if(rows.length!==1||rows[0].visitor_id!==record.visitorId||rows[0].first_ts.toISOString()!==new Date(record.from).toISOString()||rows[0].last_ts.toISOString()!==new Date(record.to).toISOString())throw Error('REMAINING_FACT_OWNER_MISSING')},cleanup:()=>client.query(`DROP TABLE IF EXISTS ${relation}`)};
 }catch(error){await client.query(`DROP TABLE IF EXISTS ${relation}`);throw error}
}
