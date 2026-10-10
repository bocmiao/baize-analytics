import type {PoolClient} from 'pg';
export interface RemainingOwnerRow {sessionId:string;visitorId:string;from?:string;to?:string}
export type RemainingOwnerKind='sessions'|'carry_checkpoints'|'carry_keys';
/** Inputs are already shape/seal/checksum validated by the source consumer.
 * Preserve SQL uniqueness failures: duplicate owners must never be hidden. */
export async function insertRemainingOwnerBatch(client:Pick<PoolClient,'query'>,relations:{owners:string;carryOwners:string},runId:string,kind:RemainingOwnerKind,rows:RemainingOwnerRow[]){
 if(rows.length>100)throw Error('REMAINING_FACT_BATCH_LIMIT');
 if(!['sessions','carry_checkpoints','carry_keys'].includes(kind))throw Error('REMAINING_FACT_SCOPE');
 if(!/^[a-z_][a-z0-9_]*$/.test(relations.owners)||!/^[a-z_][a-z0-9_]*$/.test(relations.carryOwners))throw Error('REMAINING_OWNER_RELATION_INVALID');
 if(!rows.length)return;
 const values=[runId,JSON.stringify(rows)];
 const input='jsonb_to_recordset($2::jsonb) x("sessionId" uuid,"visitorId" text,"from" timestamptz,"to" timestamptz)';
 if(kind==='carry_keys'){
  const missing=await client.query(`SELECT 1 FROM ${input} WHERE NOT EXISTS(SELECT 1 FROM ${relations.carryOwners} p WHERE p.run_id=$1::uuid AND p.visitor_id=x."visitorId" AND p.session_id=x."sessionId") LIMIT 1`,values);
  if(missing.rowCount)throw Error('REMAINING_CARRY_OWNER_MISSING');return;
 }
 if(kind==='carry_checkpoints')await client.query(`INSERT INTO ${relations.carryOwners}(run_id,visitor_id,session_id) SELECT $1::uuid,x."visitorId",x."sessionId" FROM ${input}`,values);
 await client.query(`INSERT INTO ${relations.owners}(run_id,session_id,visitor_id,started_at,ended_at,priority) SELECT $1::uuid,x."sessionId",x."visitorId",x."from",x."to",${kind==='sessions'?0:1} FROM ${input}`,values);
}
