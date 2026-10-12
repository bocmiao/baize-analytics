import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {canonical} from './security.js';

export interface FactValidationBatch {
 id:string;site_id:string;run_id:string;kind:'effects'|'vitals';attempt_id:string;
 source_aggregation_epoch:string;canonical_epoch:string|null;deletion_epoch:string|null;
 row_count:number;checksum:string;
 validation_schema_version?:number|null;validation_seal?:string|null;
}
export interface FactValidationMember {
 run_id:string;kind:'effects'|'vitals';row_key:string;batch_id:string;body_hash:string;
 visitor_id:string;event_ts:string|Date;session_id:string;event_id:string;
}
const invalid=()=>{throw Error('FACT_STORE_VALIDATION_MANIFEST_INVALID')};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hex=/^[0-9a-f]{64}$/;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
function payload(batch:FactValidationBatch,members:readonly FactValidationMember[]){
 if(!batch||!Array.isArray(members)||members.length>100||!Number.isInteger(batch.row_count)||batch.row_count<0||batch.row_count>100||members.length!==batch.row_count||typeof batch.site_id!=='string'||!batch.site_id||batch.site_id.length>2048||!['effects','vitals'].includes(batch.kind)||![batch.id,batch.run_id,batch.attempt_id,batch.source_aggregation_epoch].every(v=>typeof v==='string'&&uuid.test(v))||!(batch.canonical_epoch===null||typeof batch.canonical_epoch==='string'&&uuid.test(batch.canonical_epoch))||!(batch.deletion_epoch===null||typeof batch.deletion_epoch==='string'&&/^(0|[1-9]\d*)$/.test(batch.deletion_epoch)&&batch.deletion_epoch.length<=20)||typeof batch.checksum!=='string'||!hex.test(batch.checksum))invalid();
 const sorted=[...members].sort((a,b)=>a.row_key<b.row_key?-1:a.row_key>b.row_key?1:0),seen=new Set<string>();
 const tuples=sorted.map(m=>{
  if(!m||m.run_id!==batch.run_id||m.kind!==batch.kind||m.batch_id!==batch.id||typeof m.row_key!=='string'||!hex.test(m.row_key)||seen.has(m.row_key)||typeof m.body_hash!=='string'||!hex.test(m.body_hash)||typeof m.visitor_id!=='string'||!m.visitor_id||m.visitor_id.length>2048||![m.session_id,m.event_id].every(v=>typeof v==='string'&&uuid.test(v))||!(typeof m.event_ts==='string'||m.event_ts instanceof Date))invalid();
  seen.add(m.row_key);let ts:string;try{ts=new Date(m.event_ts).toISOString()}catch{invalid()}
  return [m.run_id,m.kind,m.row_key,m.batch_id,m.body_hash,m.visitor_id,ts!,m.session_id,m.event_id];
 });
 if(hash(sorted.map(m=>m.row_key+':'+m.body_hash).join('\n'))!==batch.checksum)invalid();
 const context=[batch.site_id,batch.run_id,batch.kind,batch.id,batch.attempt_id,batch.source_aggregation_epoch,batch.canonical_epoch,batch.deletion_epoch,batch.row_count,batch.checksum];
 return canonical(['fact-store-validation-manifest-v1',1,context,hash(canonical(tuples))]);
}
function signature(secret:string|Buffer,batch:FactValidationBatch,members:readonly FactValidationMember[]){
 if(!(typeof secret==='string'||Buffer.isBuffer(secret))||!secret.length)invalid();
 try{return createHmac('sha256',secret).update(payload(batch,members)).digest('hex')}catch{invalid()}
}
/** Certification only: caller must first validate normal schemas, original row
 * HMACs, complete CH read-back/body SHA and a fresh source fence. This function
 * cannot establish body authenticity itself. It binds immutable source epochs,
 * not the mutable live aggregation_epoch. Subset mutations must authenticate
 * the old manifest before certifying their new complete scope. */
export function signFactValidationManifest(secret:string|Buffer,batch:FactValidationBatch,members:readonly FactValidationMember[]){return {validation_schema_version:1 as const,validation_seal:signature(secret,batch,members)!}}
export function verifyFactValidationManifest(secret:string|Buffer,batch:FactValidationBatch,members:readonly FactValidationMember[]):boolean{
 if(!batch||typeof batch!=='object')invalid();
 if(batch.validation_schema_version==null&&batch.validation_seal==null)return false;
 if(batch.validation_schema_version!==1||typeof batch.validation_seal!=='string'||!hex.test(batch.validation_seal))invalid();
 const expected=Buffer.from(signature(secret,batch,members)!,'hex'),actual=Buffer.from(batch.validation_seal!,'hex');
 if(!timingSafeEqual(expected,actual))invalid();return true;
}
