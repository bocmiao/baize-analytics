import {createHash,createHmac,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {expect,it,vi} from 'vitest';
import {canonical} from '../../src/server/security.js';
import {canonicalForValidation} from '../../src/server/canonical-validation.js';
import {normalizeRemainingRecord,remainingRecordKey,type RemainingFactKind,type RemainingFactRecord} from '../../src/server/remaining-fact-record.js';
import {ClickHouseRemainingFactStore} from '../../src/server/remaining-fact-store.js';
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const site=randomUUID(),run=randomUUID(),session=randomUUID(),epoch=randomUUID(),secret='independent-unit-source',from='2026-10-11T00:00:00.000Z',to='2026-10-11T00:01:00.000Z';
const source={aggregationEpoch:epoch,canonicalEpoch:null,deletionEpoch:null};
const dimensions=JSON.parse('{"标签":"汉字😀/\\u2028","nil":null,"bool":false,"number":0.125,"__proto__":"own-value","constructor":true}') as Record<string,string|number|boolean|null>;
function input(kind:RemainingFactKind):RemainingFactRecord{
 const common={run_id:run,session_id:session},envelope={visitorId:'derived-visitor',sessionId:session,from,to};
 const state={startedAt:from,lastActive:to,entryPath:'/汉字😀/',exitPath:'/done',pageviews:1,visibleMs:0,entryDimensions:dimensions};
 if(kind==='sessions')return {...envelope,row:{...common,visitor_id:envelope.visitorId,data:{id:session,visitor_id:envelope.visitorId,started_at:from,last_active:to,entry_path:state.entryPath,exit_path:state.exitPath,pageviews:1,duration_s:60,visible_ms:0,bounced:true,dimensions}}};
 if(kind==='numerics')return {...envelope,row:{...common,bucket_kind:'hourly',bucket:from,metric:'bucket',key:[null,false,0.125,'汉字😀/'],value:0}};
 if(kind==='members')return {...envelope,row:{...common,bucket_kind:'daily',bucket:'2026-10-11',metric:'uv',key:[null,true,'汉字😀/'],visitor_id:envelope.visitorId}};
 if(kind==='carry_checkpoints')return {...envelope,row:{...common,visitor_id:envelope.visitorId,anchor_event_id:randomUUID(),through_ts:to,last_event_id:randomUUID(),privacy_mode:'standard',local_day:'2026-10-11',definitions_hash:'definitions',state,status:'valid',checksum:'original-checksum'}};
 return {...envelope,row:{...common,visitor_id:envelope.visitorId,kind:'page',key:'/汉字😀/',state:dimensions,first_ts:from,last_ts:to}};
}
function sealed(kind:RemainingFactKind,raw:RemainingFactRecord,serialize=canonical){const record=normalizeRemainingRecord(kind,raw,serialize);const key=remainingRecordKey(kind,record,serialize),bodySeal=createHmac('sha256',secret).update(serialize(['remaining-fact-store-v1',site,kind,record,source])).digest('hex'),body=serialize({...record,kind,source,bodySeal});return {record,key,bodySeal,body,hash:sha(body)};}
it.each(['sessions','numerics','members','carry_checkpoints','carry_keys'] as const)('preserves independent default-writer bytes, key, SHA and HMAC for %s',kind=>{
 const raw=input(kind),old=sealed(kind,raw),reused=sealed(kind,raw,canonicalForValidation());expect(reused).toEqual(old);expect(Object.getPrototypeOf(reused.record.row)).toBe(Object.prototype);expect({}).not.toHaveProperty('own-value');
});
function reader(kind:RemainingFactKind,reuse:boolean|undefined,fault?:'body'|'seal'|'source'|'owner'|'cp'){
 const old=sealed(kind,input(kind)),batch=randomUUID(),attempt=randomUUID();let body=old.body;
 if(fault==='body')body=body.replace('derived-visitor','changed-visitor');
 if(fault==='seal'||fault==='source'){const parsed=JSON.parse(body);if(fault==='seal')parsed.bodySeal='0'.repeat(64);else parsed.source.aggregationEpoch=randomUUID();body=canonical(parsed);}
 const bodyHash=fault==='body'?old.hash:sha(body),member={run_id:run,kind,row_key:old.key,body_hash:bodyHash,visitor_id:fault==='owner'?'changed':old.record.visitorId,session_id:session,interval_from:from,interval_to:to,...(kind==='carry_checkpoints'?{orphan:false,anchor_event_id:(old.record.row as Extract<RemainingFactRecord['row'],{anchor_event_id:string}>).anchor_event_id,last_event_id:(old.record.row as Extract<RemainingFactRecord['row'],{last_event_id:string}>).last_event_id,anchor_ts:fault==='cp'?to:from,anchor_page_id:null}:{})};
 let fetched=false;const query=vi.fn(async(sql:string)=>{if(sql.startsWith('SELECT r.epoch'))return {rows:[{epoch,current_epoch:epoch,status:'published',salt_secret:secret}]};if(sql.startsWith('SELECT * FROM analytics_remaining_fact_runs'))return {rows:[{state:'complete',aggregation_epoch:epoch}]};if(sql.startsWith('FETCH')){if(fetched)return {rows:[]};fetched=true;return {rows:[{id:batch,attempt_id:attempt,kind,aggregation_epoch:epoch,source_aggregation_epoch:epoch,canonical_epoch:null,deletion_epoch:null,row_count:1,checksum:sha(old.key+':'+bodyHash)}]};}if(sql.startsWith('SELECT * FROM analytics_remaining_fact_members'))return {rows:[member]};return {rows:[]};});
 const store=new ClickHouseRemainingFactStore({url:'http://localhost:8123',username:'unit',password:'unused',canonicalValidationReuse:reuse,fetch:async()=>new Response(JSON.stringify({data:[{row_key:old.key,body_hash:bodyHash,body}]}))});return {store,query,client:{query} as unknown as PoolClient,old};
}
it.each(['sessions','numerics','members','carry_checkpoints','carry_keys'] as const)('actual reader accepts default-produced %s identically with reuse off/on',async kind=>{
 for(const reuse of [undefined,false,true]){const f=reader(kind,reuse),rows=[];for await(const batch of f.store.streamRunRows(f.client,site,run,kind))rows.push(...batch);expect(rows).toEqual([JSON.parse(f.old.body)]);expect(f.query.mock.calls.at(-1)?.[0]).toMatch(/^CLOSE /);}
});
it.each(['body','seal','source','owner','cp'] as const)('both reader modes reject %s mutation before yielding and close their cursor',async fault=>{
 for(const reuse of [false,true]){const f=reader('carry_checkpoints',reuse,fault);await expect(f.store.streamRunRows(f.client,site,run,'carry_checkpoints').next()).rejects.toThrow(/REMAINING_FACT_(BODY_UNAVAILABLE|SEAL_INVALID)/);expect(f.query.mock.calls.at(-1)?.[0]).toMatch(/^CLOSE /);}
});
it('preserves exact normalized 32KiB boundary and carry 16KiB/4KiB limits',()=>{
 const raw=input('numerics');const baseBytes=Buffer.byteLength(canonical(normalizeRemainingRecord('numerics',raw)));const numeric=raw.row as Extract<RemainingFactRecord['row'],{value:number}>;numeric.key.push('');const overhead=Buffer.byteLength(canonical(normalizeRemainingRecord('numerics',raw)))-baseBytes;numeric.key[numeric.key.length-1]='x'.repeat(32768-baseBytes-overhead);
 expect(Buffer.byteLength(canonical(normalizeRemainingRecord('numerics',raw)))).toBe(32768);expect(normalizeRemainingRecord('numerics',raw,canonicalForValidation())).toEqual(normalizeRemainingRecord('numerics',raw));numeric.key[numeric.key.length-1]+='x';for(const serialize of [canonical,canonicalForValidation()])expect(()=>normalizeRemainingRecord('numerics',raw,serialize)).toThrow('REMAINING_FACT_BODY_LIMIT');
 for(const kind of ['carry_checkpoints','carry_keys'] as const){const oversized=input(kind);if(kind==='carry_checkpoints')(oversized.row as Extract<RemainingFactRecord['row'],{through_ts:string}>).state.entryPath='x'.repeat(16385);else(oversized.row as Extract<RemainingFactRecord['row'],{first_ts:string}>).state={value:'x'.repeat(4097)};for(const serialize of [canonical,canonicalForValidation()])expect(()=>normalizeRemainingRecord(kind,oversized,serialize)).toThrow('REMAINING_FACT_RECORD_SCOPE');}
});
it('caches only the first normalized subtree, never mutable wire provenance or another row',()=>{
 const serialize=canonicalForValidation(),first=normalizeRemainingRecord('numerics',input('numerics'),serialize),wireSource:{aggregationEpoch:string;canonicalEpoch:string|null;deletionEpoch:string|null}={...source};expect(serialize({first,wireSource})).toBe(canonical({first,wireSource}));wireSource.deletionEpoch='1';expect(serialize({first,wireSource})).toBe(canonical({first,wireSource}));
 const second=input('numerics');(second.row as Extract<RemainingFactRecord['row'],{value:number}>).value=123;const independent=sealed('numerics',second,canonicalForValidation());expect(independent).toEqual(sealed('numerics',second));expect(independent.body).not.toBe(sealed('numerics',input('numerics')).body);
});
it('rejects an invalid reuse option rather than enabling an arbitrary truthy value',()=>{expect(()=>new ClickHouseRemainingFactStore({url:'http://localhost',username:'unit',password:'unused',canonicalValidationReuse:'1' as never})).toThrow('REMAINING_FACT_VALIDATION_CONFIG');});

it('the reusable serializer first sees the complete normalized result, never a carry state or wire envelope',()=>{
 for(const kind of ['carry_checkpoints','carry_keys'] as const){const serialize=vi.fn(canonical);const normalized=normalizeRemainingRecord(kind,input(kind),serialize);expect(serialize).toHaveBeenCalledTimes(1);expect(serialize.mock.calls[0]?.[0]).toBe(normalized);expect(normalized).toHaveProperty('row');expect(normalized).not.toHaveProperty('source');}
 const raw=input('carry_keys');(raw.row as Extract<RemainingFactRecord['row'],{first_ts:string}>).state={value:'x'.repeat(4097)};const ignored=vi.fn(()=> '{}');expect(()=>normalizeRemainingRecord('carry_keys',raw,ignored)).toThrow('REMAINING_FACT_RECORD_SCOPE');expect(ignored).not.toHaveBeenCalled();
});
