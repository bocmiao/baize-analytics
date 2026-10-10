import {prepareRemainingHeaderOwnership} from './remaining-header-ownership.js';
import type {ClickHouseSessionHeaderStore} from './session-header-store.js';
import {randomUUID,createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {canonical} from './security.js';
import {exportControlledCarryProofs} from './carry-provenance.js';
import type {CarryCheckpoint} from './session-carry.js';
import type {ClickHouseRemainingFactStore,RemainingFactFence} from './remaining-fact-store.js';
import type {RemainingFactKind,RemainingFactRecord} from './remaining-fact-record.js';

const tables={carry_checkpoints:'analytics_carry_checkpoints',carry_keys:'analytics_carry_keys',sessions:'analytics_session_facts',numerics:'analytics_numeric_facts',members:'analytics_member_facts'} as const;
/** Upload only final SQL-coalesced bodies. No PG body pruning occurs here.
 * The transaction owns all staging rows and publication/authority fences. */
export async function publishRemainingFactBodies(client:PoolClient,store:Pick<ClickHouseRemainingFactStore,'stageRecords'|'completeRunKind'>,siteId:string,runId:string,fence:RemainingFactFence,headerStore?:ClickHouseSessionHeaderStore){
 const orphan=(await client.query(`SELECT 1 FROM (SELECT run_id,session_id FROM analytics_numeric_facts WHERE run_id=$1 UNION SELECT run_id,session_id FROM analytics_member_facts WHERE run_id=$1) f WHERE NOT EXISTS(SELECT 1 FROM analytics_session_facts s WHERE s.run_id=f.run_id AND s.session_id=f.session_id) LIMIT 1`,[runId])).rowCount;
 if(orphan&&!headerStore)throw Error('REMAINING_FACT_TRUSTED_HEADER_OWNER_REQUIRED');
 const status=(await client.query('SELECT status FROM analytics_fact_runs WHERE id=$1 AND site_id=$2',[runId,siteId])).rows[0]?.status;
 const ownership=orphan?await prepareRemainingHeaderOwnership(client,runId,status==='published'?headerStore!.streamRows(client,siteId,runId):headerStore!.streamCompletedProducerRows(client,siteId,runId,fence)):undefined;
 const publicationFence={...fence,...(ownership?{verifyHeaderOwnership:ownership.verify}:{})};
 try{
 const verifyCarryProvenance=async(record:RemainingFactRecord)=>{
  const row=record.row as Record<string,unknown>;const state=row.state as CarryCheckpoint['state'];
  const checkpoint:CarryCheckpoint={visitorId:record.visitorId,sessionId:record.sessionId,anchorEventId:String(row.anchor_event_id),through:new Date(row.through_ts as string).toISOString(),lastEventId:String(row.last_event_id),privacyMode:row.privacy_mode as CarryCheckpoint['privacyMode'],localDay:row.local_day instanceof Date?row.local_day.toISOString().slice(0,10):String(row.local_day),definitionsHash:String(row.definitions_hash),state,status:row.status as CarryCheckpoint['status']};
  if(createHash('sha256').update(canonical({siteId,...checkpoint})).digest('hex')!==row.checksum)throw Error('REMAINING_CARRY_CHECKSUM_INVALID');
  await exportControlledCarryProofs(client,siteId,[{runId,checkpoint}]);
 };
 for(const kind of Object.keys(tables) as RemainingFactKind[]){
  const cursor=`remaining_publish_${randomUUID().replaceAll('-','')}`;
  const envelope=kind==='sessions'?"r.visitor_id AS visitor, r.data->>'started_at' AS first,r.data->>'last_active' AS last":kind==='carry_checkpoints'?"r.visitor_id AS visitor,r.state->>'startedAt' AS first,r.through_ts AS last":kind==='carry_keys'?"r.visitor_id AS visitor,r.first_ts AS first,r.last_ts AS last":"COALESCE(s.visitor_id,h.visitor_id,c.visitor_id) AS visitor,COALESCE(s.data->>'started_at',h.first_ts::text,c.state->>'startedAt') AS first,COALESCE(s.data->>'last_active',h.last_ts::text,c.state->>'lastActive') AS last";
  const joins=kind==='numerics'||kind==='members'?'LEFT JOIN analytics_session_facts s ON s.run_id=r.run_id AND s.session_id=r.session_id LEFT JOIN analytics_carry_checkpoints c ON c.run_id=r.run_id AND c.session_id=r.session_id LEFT JOIN '+(ownership?ownership.relation:'(SELECT NULL::uuid session_id,NULL::text visitor_id,NULL::timestamptz first_ts,NULL::timestamptz last_ts WHERE false)')+' h ON h.session_id=r.session_id':'';
  await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT to_jsonb(r) AS body,${envelope} FROM ${tables[kind]} r ${joins} WHERE r.run_id=$1 ORDER BY r.session_id`,[runId]);
  try{while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows;if(!rows.length)break;
   const records=rows.map(r=>{if(!r.visitor||!r.first||!r.last)throw Error('REMAINING_FACT_OWNER_MISSING');return {row:r.body,visitorId:r.visitor,sessionId:r.body.session_id,from:r.first,to:r.last} as RemainingFactRecord;});
   await store.stageRecords(client,siteId,runId,kind,records,{...publicationFence,verifyCarryProvenance});
  }}finally{await client.query(`CLOSE ${cursor}`);}
  await store.completeRunKind(client,siteId,runId,kind,publicationFence);
 }
 }finally{await ownership?.cleanup();}
}
