import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {replayIsMasked} from './governance.js';
import {replayPayloadHash} from './replay-hash.js';
import type {StoredEvent} from './clickhouse-store.js';
/** Derive only from a real masked body; never manufacture sequence zero or a
 * missing first chunk. A session beginning at seq>0 remains explicitly partial. */
export function deriveReplayIndexMetadata(event:StoredEvent){
 const records=event.payload.replay,seq=event.payload.seq??event.payload.replay_seq;
 if(event.type!=='replay'||!Array.isArray(records)||!records.length||!replayIsMasked(records))throw Error('REPLAY_BACKFILL_MASK_REQUIRED');
 if(!Number.isSafeInteger(seq)||Number(seq)<0)throw Error('REPLAY_BACKFILL_SEQUENCE_REQUIRED');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.page_id)||!event.visitor_id||!Number.isFinite(+new Date(event.ts)))throw Error('REPLAY_BACKFILL_IDENTITY_INVALID');
 const times=records.map(record=>(record as {timestamp:number}).timestamp);if(times.some(ts=>!Number.isFinite(ts)||Math.abs(ts)>8640000000000000))throw Error('REPLAY_BACKFILL_TIMESTAMP_INVALID');
 return {sessionId:`${event.visitor_id}:${event.page_id.toLowerCase()}`,seq:Number(seq),eventId:event.event_id,ts:new Date(event.ts),pageId:event.page_id.toLowerCase(),visitorId:event.visitor_id,path:event.path,payloadHash:replayPayloadHash(records),recordStartedAt:new Date(Math.min(...times)),recordEndedAt:new Date(Math.max(...times))};
}
/** Migration-only sameclient PG replay index proof. Historical opt-in can have
 * been revoked; the retained body must still exactly match its original chunk.
 * Absent raw bodies or conflicting seq/hash fail closed rather than pretending
 * every legacy session starts with a playable full snapshot. */
export async function backfillPgReplayKeys(client:PoolClient,siteId:string){
 const site=(await client.query('SELECT privacy_mode FROM sites WHERE id=$1',[siteId])).rows[0];if(!site)throw Error('REPLAY_BACKFILL_SITE_REQUIRED');
 const count=(await client.query("SELECT count(*)::int AS n FROM events WHERE site_id=$1 AND type='replay'",[siteId])).rows[0].n;
 if(site.privacy_mode==='daily_salt'&&count)throw Error('REPLAY_BACKFILL_DAILY_UNSUPPORTED');
 const cursor=`replay_backfill_${randomUUID().replaceAll('-','')}`;await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT * FROM events WHERE site_id=$1 AND type='replay' ORDER BY ts,event_id`,[siteId]);let indexed=0;
 try{while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows;if(!rows.length)break;for(const row of rows){const meta=deriveReplayIndexMetadata(row);const chunk=(await client.query('SELECT payload FROM replay_chunks WHERE site_id=$1 AND session_id=$2 AND seq=$3',[siteId,meta.sessionId,meta.seq])).rows[0];if(!chunk||!replayIsMasked(chunk.payload)||replayPayloadHash(chunk.payload)!==meta.payloadHash)throw Error('REPLAY_BACKFILL_SOURCE_MISMATCH');const result=await client.query(`INSERT INTO replay_chunk_keys(site_id,session_id,seq,event_id,ts,page_id,visitor_id,path,payload_hash,record_started_at,record_ended_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(site_id,session_id,seq) DO UPDATE SET payload_hash=replay_chunk_keys.payload_hash WHERE replay_chunk_keys.event_id=EXCLUDED.event_id AND replay_chunk_keys.payload_hash=EXCLUDED.payload_hash RETURNING event_id`,[siteId,meta.sessionId,meta.seq,meta.eventId,meta.ts,meta.pageId,meta.visitorId,meta.path,meta.payloadHash,meta.recordStartedAt,meta.recordEndedAt]);if(!result.rowCount)throw Error('REPLAY_BACKFILL_INDEX_CONFLICT');indexed++;}}
 }finally{await client.query(`CLOSE ${cursor}`);}
 const missing=(await client.query('SELECT 1 FROM replay_chunks c LEFT JOIN replay_chunk_keys k USING(site_id,session_id,seq) WHERE c.site_id=$1 AND k.event_id IS NULL LIMIT 1',[siteId])).rowCount;if(missing)throw Error('REPLAY_BACKFILL_RAW_UNAVAILABLE');
 const sessions=(await client.query(`SELECT k.session_id,min(k.seq)::text AS first_seq,max(k.seq)::text AS last_seq,count(*)::int AS chunks,bool_or(k.seq=0 AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(e.payload->'replay','[]')) record WHERE record->>'type'='2')) AS starts_with_snapshot FROM replay_chunk_keys k LEFT JOIN events e ON e.site_id=k.site_id AND e.event_id=k.event_id WHERE k.site_id=$1 GROUP BY k.session_id ORDER BY k.session_id`,[siteId])).rows;
 return {indexed,sessions:sessions.map(row=>({...row,first_seq:Number(row.first_seq),last_seq:Number(row.last_seq),complete_from_start:Number(row.first_seq)===0&&Number(row.last_seq)+1===row.chunks&&row.starts_with_snapshot===true}))};
}
