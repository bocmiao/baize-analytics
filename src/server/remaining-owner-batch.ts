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

export interface ResolvedRemainingOwner {visitor_id:string;started_at:string|Date;ended_at:string|Date}
/** Resolve all requested sessions once. Only absent sessions invoke the caller's
 * authenticated header reader; repeated rows never trigger repeated reads. */
export async function resolveRemainingOwnerBatch(client:Pick<PoolClient,'query'>,ownersRelation:string,runId:string,sessions:string[],readSealedOwner:(sessionId:string)=>Promise<ResolvedRemainingOwner>):Promise<Map<string,ResolvedRemainingOwner>>{
 if(sessions.length>100)throw Error('REMAINING_FACT_BATCH_LIMIT');
 if(!/^[a-z_][a-z0-9_]*$/.test(ownersRelation))throw Error('REMAINING_OWNER_RELATION_INVALID');
 const ids=[...new Set(sessions)],result=new Map<string,ResolvedRemainingOwner>();if(!ids.length)return result;
 const existing=await client.query(`SELECT DISTINCT ON(session_id) session_id,visitor_id,started_at,ended_at FROM ${ownersRelation} WHERE run_id=$1::uuid AND session_id=ANY($2::uuid[]) ORDER BY session_id,priority`,[runId,ids]);
 for(const row of existing.rows)result.set(row.session_id,row);
 for(const sessionId of ids){if(result.has(sessionId))continue;const owner=await readSealedOwner(sessionId);
  if(!owner?.visitor_id||!Number.isFinite(+new Date(owner.started_at))||!Number.isFinite(+new Date(owner.ended_at)))throw Error('REMAINING_FACT_OWNER_MISSING');
  await client.query(`INSERT INTO ${ownersRelation}(run_id,session_id,visitor_id,started_at,ended_at,priority) VALUES($1,$2,$3,$4,$5,2)`,[runId,sessionId,owner.visitor_id,owner.started_at,owner.ended_at]);result.set(sessionId,owner);
 }
 return result;
}
