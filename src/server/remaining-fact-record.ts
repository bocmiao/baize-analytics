import {z} from 'zod';
import {canonical} from './security.js';
import {digest} from './remaining-fact-transport.js';
const primitive=z.union([z.string(),z.number().finite(),z.boolean(),z.null()]);
const timestamp=z.union([z.date(),z.string()]).transform(v=>new Date(v).toISOString());
const dimensions=z.record(z.string(),primitive);
const identity={run_id:z.uuid(),session_id:z.uuid()};
const state=z.object({startedAt:timestamp,lastActive:timestamp,anchorPageId:z.uuid().optional(),entryPath:z.string(),exitPath:z.string(),pageviews:z.number().int().nonnegative(),visibleMs:z.number().finite().nonnegative(),entryDimensions:dimensions,exitDimensions:dimensions.optional(),lastNonDirect:z.object({channel:z.string(),path:z.string()}).strict().optional(),hasPage:z.boolean().optional(),previousPath:z.string().optional(),firstPageAt:timestamp.optional(),firstPageId:z.uuid().optional(),firstPageInstance:z.uuid().optional(),lastPageAt:timestamp.optional(),lastPageId:z.uuid().optional(),lastPageInstance:z.uuid().optional()}).strict();
const data=z.object({id:z.uuid(),visitor_id:z.string().min(1),started_at:timestamp,last_active:timestamp,entry_path:z.string(),exit_path:z.string(),pageviews:z.number().int().nonnegative(),duration_s:z.number().finite().nonnegative(),visible_ms:z.number().finite().nonnegative(),bounced:z.boolean(),dimensions}).strict();
const bucket={...identity,bucket_kind:z.enum(['hourly','daily']),bucket:z.string().min(1),metric:z.string().min(1),key:z.array(primitive)};
export const remainingSchemas={
 sessions:z.object({...identity,visitor_id:z.string().min(1),data}).strict(),
 numerics:z.object({...bucket,value:z.number().finite()}).strict(),
 members:z.object({...bucket,visitor_id:z.string().min(1)}).strict(),
 carry_checkpoints:z.object({...identity,visitor_id:z.string().min(1),anchor_event_id:z.uuid(),through_ts:timestamp,last_event_id:z.uuid(),privacy_mode:z.enum(['standard','daily_salt']),local_day:z.union([z.date(),z.string()]).transform(v=>v instanceof Date?v.toISOString().slice(0,10):v),definitions_hash:z.string(),state,status:z.enum(['valid','unavailable']),checksum:z.string()}).strict(),
 carry_keys:z.object({...identity,visitor_id:z.string().min(1),kind:z.enum(['page','heartbeat','order','goal','funnel']),key:z.string().max(512),state:z.record(z.string(),primitive),first_ts:timestamp,last_ts:timestamp}).strict()
};
export type RemainingFactKind=keyof typeof remainingSchemas;
export type RemainingFactRow={ [K in RemainingFactKind]:z.infer<typeof remainingSchemas[K]> }[RemainingFactKind];
export interface RemainingFactRecord {row:RemainingFactRow;visitorId:string;sessionId:string;from:string|Date;to:string|Date}
export function normalizeRemainingRecord(kind:RemainingFactKind,input:RemainingFactRecord,serialize=canonical){
 if(Object.keys(input).some(k=>!['row','visitorId','sessionId','from','to'].includes(k))||!Object.hasOwn(remainingSchemas,kind)||!input.visitorId||input.visitorId.length>2048||!z.uuid().safeParse(input.sessionId).success)throw Error('REMAINING_FACT_RECORD_SHAPE');
 const row=remainingSchemas[kind].parse(input.row),from=timestamp.parse(input.from),to=timestamp.parse(input.to);if(from>to||row.session_id!==input.sessionId||('visitor_id' in row&&row.visitor_id!==input.visitorId))throw Error('REMAINING_FACT_RECORD_SCOPE');
 if(kind==='sessions'){const r=row as z.infer<typeof remainingSchemas.sessions>;if(r.data.id!==r.session_id||r.data.visitor_id!==input.visitorId||r.data.started_at!==from||r.data.last_active!==to)throw Error('REMAINING_FACT_RECORD_SCOPE')}
 if(kind==='carry_checkpoints'){const r=row as z.infer<typeof remainingSchemas.carry_checkpoints>;if(r.state.startedAt!==from||r.through_ts!==to||r.state.lastActive>to||Buffer.byteLength(canonical(r.state))>16384)throw Error('REMAINING_FACT_RECORD_SCOPE')}
 if(kind==='carry_keys'){const r=row as z.infer<typeof remainingSchemas.carry_keys>;if(r.first_ts!==from||r.last_ts!==to||Buffer.byteLength(canonical(r.state))>4096)throw Error('REMAINING_FACT_RECORD_SCOPE')}
 const result={row,visitorId:input.visitorId,sessionId:input.sessionId,from,to};if(Buffer.byteLength(serialize(result))>32768)throw Error('REMAINING_FACT_BODY_LIMIT');return result;
}
export function remainingRecordKey(kind:RemainingFactKind,input:ReturnType<typeof normalizeRemainingRecord>,serialize=canonical){const r=input.row;let key:unknown[]=[r.run_id,r.session_id];if(kind==='carry_checkpoints')key=[r.run_id,(r as z.infer<typeof remainingSchemas.carry_checkpoints>).visitor_id];if(kind==='carry_keys'){const c=r as z.infer<typeof remainingSchemas.carry_keys>;key=[c.run_id,c.visitor_id,c.kind,c.key]}if(kind==='numerics'||kind==='members'){const c=r as z.infer<typeof remainingSchemas.members>;key=[c.run_id,c.bucket_kind,c.bucket,c.session_id,c.metric,c.key,...(kind==='members'?[c.visitor_id]:[])]}return digest(serialize(key))}
