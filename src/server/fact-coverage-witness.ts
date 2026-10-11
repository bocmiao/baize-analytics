import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import type {PoolClient} from 'pg';
import {canonical} from './security.js';
import {assertFactRunClosure,selectedFactRunPredicate} from './fact-run-closure.js';

export interface FactCoverageWitnessRecord {
 site_id:string;version:1;state:'valid'|'invalid';reason:string|null;coverage_from:string;observed_at:string;
 accepted_outbox_high:string;aggregation_epoch:string;canonical_epoch:string;deletion_epoch:string;
 processed_generation:string;non_event_generation:string;config_hash:string;closure_digest:string;closure_rows:string;source_run_id:string;seal:string;
}
export interface FactCoverageWitnessToken {readonly kind:'fact_coverage_prior'}
export interface FullFactCoverageSource {readonly kind:'fact_coverage_full_source'}
export interface StoredFactCoverageWitness {readonly kind:'fact_coverage_stored_source'}
interface State {epoch:string;generation:string;processed_generation:string;non_event_generation:string;canonical_epoch:string;deletion_epoch:string;authority:string;secret:string;configHash:string}
const priors=new WeakMap<FactCoverageWitnessToken,{client:PoolClient;site:string;record:FactCoverageWitnessRecord}>();
const fullSources=new WeakMap<FullFactCoverageSource,{client:PoolClient;site:string;run:string;from:string;high:string;generation:string;nonEvent:string;configHash:string;epoch:string;canonical:string;deletion:string}>();
const storedSources=new WeakMap<StoredFactCoverageWitness,{client:PoolClient;site:string;record:FactCoverageWitnessRecord}>();
const iso=(value:unknown)=>new Date(value as string|Date).toISOString();
const digest=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
/** Raw retention duration is intentionally excluded; interpretation rules are not. */
export function coverageConfigHash(input:{timezone:unknown;privacyMode:unknown;config:unknown;goals:unknown;funnels:unknown}){const config={...(input.config as Record<string,unknown>)};delete config.deletion_boundary;return digest({...input,config});}
async function current(c:PoolClient,site:string):Promise<State>{
 const row=(await c.query(`SELECT a.epoch::text,a.generation::text,a.processed_generation::text,a.non_event_generation::text,v.authority,v.epoch::text canonical_epoch,v.deletion_epoch::text,s.salt_secret secret,s.timezone,s.privacy_mode,s.config FROM aggregation_state a JOIN sites s ON s.id=a.site_id LEFT JOIN canonical_event_authority v ON v.site_id=a.site_id WHERE a.site_id=$1`,[site])).rows[0];
 if(!row||row.authority!=='clickhouse')throw Error('FACT_COVERAGE_AUTHORITY');
 const goals=(await c.query('SELECT id,name,type,config FROM goals WHERE site_id=$1 ORDER BY id',[site])).rows, funnels=(await c.query('SELECT id,name,steps,strict FROM funnels WHERE site_id=$1 ORDER BY id',[site])).rows;
 return {...row,configHash:coverageConfigHash({timezone:row.timezone,privacyMode:row.privacy_mode,config:row.config,goals,funnels})};
}
function normalized(row:Record<string,unknown>):FactCoverageWitnessRecord{
 return {...row,version:Number(row.version),coverage_from:iso(row.coverage_from),observed_at:iso(row.observed_at),accepted_outbox_high:String(row.accepted_outbox_high),processed_generation:String(row.processed_generation),non_event_generation:String(row.non_event_generation),deletion_epoch:String(row.deletion_epoch),closure_rows:String(row.closure_rows)} as FactCoverageWitnessRecord;
}
function signed(secret:string,record:Omit<FactCoverageWitnessRecord,'seal'>){return createHmac('sha256',secret).update(canonical(['fact-coverage-witness-v1',record])).digest('hex');}
function assertSeal(secret:string,record:FactCoverageWitnessRecord){const {seal,...body}=record;const expected=Buffer.from(signed(secret,body)),actual=Buffer.from(seal);if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error('FACT_COVERAGE_SEAL_INVALID');}
async function load(c:PoolClient,site:string){if(!(await c.query("SELECT to_regclass('analytics_fact_coverage_witnesses') present")).rows[0]?.present)return null;const row=(await c.query('SELECT * FROM analytics_fact_coverage_witnesses WHERE site_id=$1',[site])).rows[0];return row?normalized(row):null;}
/** Metadata hash is bounded and includes empty owners and explicit zero-kind
 * completion. It supplements, never replaces, original sealed body readers. */
async function closure(c:PoolClient,site:string){return withCoverageMetadataUtc(c,()=>closureUtc(c,site));}
/** Transaction-local metadata serialization scope; does not change site rules. */
export async function withCoverageMetadataUtc<T>(c:PoolClient,fn:()=>Promise<T>):Promise<T>{
 const priorTimezone=(await c.query("SELECT current_setting('TimeZone') timezone")).rows[0].timezone as string;
 await c.query("SELECT set_config('TimeZone','UTC',true)");
 let failed=false;try{return await fn();}catch(error){failed=true;throw error;}finally{try{await c.query("SELECT set_config('TimeZone',$1,true)",[priorTimezone]);}catch(error){if(!failed)throw error;}}
}
async function closureUtc(c:PoolClient,site:string){
 await assertFactRunClosure(c,site,{forRebuild:true});
 const hash=createHash('sha256');let rows=0n;
 const tables=['analytics_session_contribution_heads','analytics_carry_heads','analytics_relational_buckets','analytics_session_rebuild_requests','analytics_fact_runs','analytics_header_runs','analytics_header_batches','analytics_header_members','analytics_fact_store_runs','analytics_fact_store_batches','analytics_fact_store_members','analytics_remaining_fact_runs','analytics_remaining_fact_batches','analytics_remaining_fact_members'];
 const selected=selectedFactRunPredicate.replaceAll('a.processed_generation','a.generation');
 for(const table of tables){const cursor=`coverage_${randomUUID().replaceAll('-','')}`;const query=table==='analytics_fact_runs'?`SELECT to_jsonb(t) body FROM ${table} t JOIN aggregation_state a ON a.site_id=t.site_id WHERE t.site_id=$1 AND ${selected.replaceAll('r.','t.')}`:table==='analytics_session_rebuild_requests'||table==='analytics_session_contribution_heads'||table==='analytics_carry_heads'||table==='analytics_relational_buckets'?`SELECT to_jsonb(t) body FROM ${table} t WHERE t.site_id=$1`:`SELECT to_jsonb(t) body FROM ${table} t JOIN analytics_fact_runs r ON r.id=t.run_id JOIN aggregation_state a ON a.site_id=r.site_id WHERE r.site_id=$1 AND ${selected}`;
  await c.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT body FROM (${query}) q ORDER BY body::text`,[site]);
  try{for(;;){const page=(await c.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows;if(!page.length)break;for(const item of page){hash.update(canonical({table,row:item.body})+'\n');rows++;}}}finally{await c.query(`CLOSE ${cursor}`);}
 }
 return {digest:hash.digest('hex'),rows:rows.toString()};
}
function sameState(record:FactCoverageWitnessRecord,s:State){return record.aggregation_epoch===s.epoch&&record.canonical_epoch===s.canonical_epoch&&record.deletion_epoch===s.deletion_epoch&&record.processed_generation===s.processed_generation&&record.non_event_generation===s.non_event_generation&&record.config_hash===s.configHash;}
async function write(c:PoolClient,record:Omit<FactCoverageWitnessRecord,'seal'>,secret:string){const complete={...record,seal:signed(secret,record)},keys=Object.keys(complete);await c.query(`INSERT INTO analytics_fact_coverage_witnesses(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT(site_id) DO UPDATE SET ${keys.filter(k=>k!=='site_id').map(k=>`${k}=excluded.${k}`).join(',')}`,Object.values(complete));return complete;}

/** Capture before a controlled mutation, with the same P/site-held client. */
export async function captureFactCoverageWitness(c:PoolClient,site:string):Promise<FactCoverageWitnessToken|null>{
 const record=await load(c,site);if(!record||record.state!=='valid')return null;let s:State;try{s=await current(c,site);}catch(error){if(error instanceof Error&&error.message==='FACT_COVERAGE_AUTHORITY')return null;throw error;}assertSeal(s.secret,record);
 if(!sameState(record,s))return null;const summary=await closure(c,site);if(summary.digest!==record.closure_digest||summary.rows!==record.closure_rows)throw Error('FACT_COVERAGE_CLOSURE_MISMATCH');
 const token=Object.freeze({kind:'fact_coverage_prior' as const});priors.set(token,{client:c,site,record});return token;
}
/** Only the worker's actual FULL producer may call this after full source and
 * original CH publication authentication. Ordinary migration/export is not an
 * initialization entry. Run metadata is an additional fence, not a raw oracle. */
export async function captureFullFactCoverageSource(c:PoolClient,site:string,runId:string):Promise<FullFactCoverageSource>{
 const s=await current(c,site),run=(await c.query(`SELECT r.*,p.mode,p.non_event_generation::text captured_non_event FROM analytics_fact_runs r JOIN analytics_incremental_run_plans p ON p.run_id=r.id WHERE r.id=$1 AND r.site_id=$2`,[runId,site])).rows[0];
 if(!run||run.mode!=='full'||!['ready','published'].includes(run.status)||run.epoch!==s.epoch||run.source_authority!=='clickhouse'||run.canonical_epoch!==s.canonical_epoch||String(run.canonical_deletion_epoch)!==s.deletion_epoch||run.captured_non_event!==s.non_event_generation||!run.retained_from)throw Error('FACT_COVERAGE_FULL_SOURCE_FENCE');
 const token=Object.freeze({kind:'fact_coverage_full_source' as const});fullSources.set(token,{client:c,site,run:runId,from:iso(run.retained_from),high:String(run.outbox_high_watermark),generation:String(run.generation),nonEvent:s.non_event_generation,configHash:s.configHash,epoch:s.epoch,canonical:s.canonical_epoch,deletion:s.deletion_epoch});return token;
}
export async function invalidateFactCoverageWitness(c:PoolClient,site:string,reason:string){const record=await load(c,site);if(!record)return;const secret=(await c.query('SELECT salt_secret FROM sites WHERE id=$1',[site])).rows[0]?.salt_secret;if(!secret)throw Error('FACT_COVERAGE_SITE_MISSING');assertSeal(secret,record);const {seal:ignored,...body}=record;void ignored;await write(c,{...body,state:'invalid',reason},secret);}
export async function advanceFactCoverageWitness(c:PoolClient,site:string,token:FactCoverageWitnessToken|null,input:{operation:'publication'|'privacy_delete'|'raw_retention'|'retention_configuration';fullSource?:FullFactCoverageSource;observedAt?:string}){
 const prior=token?priors.get(token):undefined;if(token&&(!prior||prior.client!==c||prior.site!==site))throw Error('FACT_COVERAGE_TOKEN_SCOPE');
 const full=input.fullSource?fullSources.get(input.fullSource):undefined;if(input.fullSource&&(!full||full.client!==c||full.site!==site))throw Error('FACT_COVERAGE_FULL_SOURCE_SCOPE');
 const existing=await load(c,site);if(!existing&&!prior&&!full)return;
 let s:State;try{s=await current(c,site);}catch(error){if(error instanceof Error&&error.message==='FACT_COVERAGE_AUTHORITY'&&!full){await invalidateFactCoverageWitness(c,site,'authority_changed');return;}throw error;}
 if(prior&&existing?.seal!==prior.record.seal)throw Error('FACT_COVERAGE_CONCURRENT_TRANSITION');
 if(prior&&(prior.record.config_hash!==s.configHash||prior.record.canonical_epoch!==s.canonical_epoch)){await invalidateFactCoverageWitness(c,site,'interpretation_or_namespace_changed');return;}
 if(!prior&&!full){if(existing)await invalidateFactCoverageWitness(c,site,'missing_continuity');return;}
 if(input.operation==='publication'){
  if(full&&(full.epoch!==s.epoch||full.canonical!==s.canonical_epoch||full.deletion!==s.deletion_epoch||full.nonEvent!==s.non_event_generation||full.generation!==s.processed_generation||full.configHash!==s.configHash))throw Error('FACT_COVERAGE_FULL_PUBLICATION_FENCE');
  if(prior&&!full&&(prior.record.aggregation_epoch!==s.epoch||prior.record.deletion_epoch!==s.deletion_epoch||prior.record.non_event_generation!==s.non_event_generation))throw Error('FACT_COVERAGE_PUBLICATION_GAP');
 }
 const head=(await c.query(`SELECT r.id,r.outbox_high_watermark::text,r.created_at,clock_timestamp() server_now FROM analytics_fact_runs r WHERE r.site_id=$1 AND r.status='published' AND r.query_version=2 ORDER BY generation DESC,created_at DESC LIMIT 1`,[site])).rows[0];if(!head)throw Error('FACT_COVERAGE_HEAD_MISSING');
 const summary=await closure(c,site),base=prior?.record;
 const high=input.operation==='publication'?String(BigInt(full?.high??head.outbox_high_watermark)>BigInt(base?.accepted_outbox_high??'0')?BigInt(full?.high??head.outbox_high_watermark):BigInt(base?.accepted_outbox_high??'0')):base?.accepted_outbox_high;
 let observedAt:string;try{observedAt=input.operation==='publication'?iso(input.observedAt??head.created_at):base!.observed_at;}catch{throw Error('FACT_COVERAGE_OBSERVATION_TIME');}
 if(observedAt>iso(head.server_now)||base&&observedAt<base.observed_at)throw Error('FACT_COVERAGE_OBSERVATION_TIME');
 if(high===undefined||base&&BigInt(high)<BigInt(base.accepted_outbox_high))throw Error('FACT_COVERAGE_HIGH_WATERMARK');
 await write(c,{site_id:site,version:1,state:'valid',reason:null,coverage_from:base?.coverage_from??full!.from,observed_at:observedAt,accepted_outbox_high:high,aggregation_epoch:s.epoch,canonical_epoch:s.canonical_epoch,deletion_epoch:s.deletion_epoch,processed_generation:s.processed_generation,non_event_generation:s.non_event_generation,config_hash:s.configHash,closure_digest:summary.digest,closure_rows:summary.rows,source_run_id:base?.source_run_id??full!.run},s.secret);
}
/** The returned time is an accepted snapshot boundary, never a future promise.
 * Cache bucket padding preserves requestedTo; ordinary API future rules remain. */
export async function verifyFactCoverageWitness(c:PoolClient,site:string,scope:{from:string;to:string;bucketSnapshot?:boolean}){
 const from=iso(scope.from),to=iso(scope.to);if(from>=to)throw Error('FACT_COVERAGE_RANGE');const s=await current(c,site);if(s.generation!==s.processed_generation)throw Error('FACT_COVERAGE_NOT_CLEAN');
 const record=await load(c,site);if(!record||record.state!=='valid')throw Error('FACT_COVERAGE_UNAVAILABLE');assertSeal(s.secret,record);if(!sameState(record,s)||from<record.coverage_from)throw Error('FACT_COVERAGE_RANGE_UNAVAILABLE');
 if((await c.query('SELECT 1 FROM analytics_session_rebuild_requests WHERE site_id=$1 LIMIT 1',[site])).rowCount)throw Error('FACT_COVERAGE_PENDING_REBUILD');
 const summary=await closure(c,site);if(summary.digest!==record.closure_digest||summary.rows!==record.closure_rows)throw Error('FACT_COVERAGE_CLOSURE_MISMATCH');
 if(!scope.bucketSnapshot&&to>record.observed_at)throw Error('FACT_COVERAGE_FUTURE_RANGE');
 return {covered:true as const,from,requestedTo:to,effectiveTo:to<record.observed_at?to:record.observed_at,observedAt:record.observed_at,acceptedOutboxHigh:record.accepted_outbox_high,configHash:record.config_hash,sourceRunId:record.source_run_id,method:'authenticated_accepted_snapshot_witness' as const};
}
export async function verifyStoredFactCoverageWitness(c:PoolClient,site:string):Promise<StoredFactCoverageWitness|null>{const record=await load(c,site);if(!record)return null;const s=await current(c,site);assertSeal(s.secret,record);if(record.state!=='valid')return null;if(!sameState(record,s))throw Error('FACT_COVERAGE_STORED_SOURCE_FENCE');const summary=await closure(c,site);if(summary.digest!==record.closure_digest||summary.rows!==record.closure_rows)throw Error('FACT_COVERAGE_CLOSURE_MISMATCH');const token=Object.freeze({kind:'fact_coverage_stored_source' as const});storedSources.set(token,{client:c,site,record});return token;}
/** Isolated signed restore is a separate authorized transition; source record
 * HMAC, original live fences and original closure must validate before target
 * epoch/owner remapping. The callback must authenticate the signed namespace
 * projection and sidecars, target isolation, and the exact latest-journal
 * transformation; target emptiness alone is insufficient authorization. */
export async function restoreFactCoverageWitness(c:PoolClient,site:string,token:StoredFactCoverageWitness,assertSignedIsolatedTarget:()=>Promise<void>){const source=storedSources.get(token);if(!source||source.client!==c||source.site!==site)throw Error('FACT_COVERAGE_RESTORE_SCOPE');await assertSignedIsolatedTarget();const s=await current(c,site);if(source.record.state!=='valid'||source.record.config_hash!==s.configHash){await invalidateFactCoverageWitness(c,site,'restore_interpretation_changed');return;}const summary=await closure(c,site),{seal:ignored,...body}=source.record;void ignored;await write(c,{...body,aggregation_epoch:s.epoch,canonical_epoch:s.canonical_epoch,deletion_epoch:s.deletion_epoch,processed_generation:s.processed_generation,non_event_generation:s.non_event_generation,closure_digest:summary.digest,closure_rows:summary.rows},s.secret);}

export interface RestoreRebuildCoverageToken {readonly kind:'fact_coverage_restore_rebuild'}
const rebuildSources=new WeakMap<RestoreRebuildCoverageToken,{client:PoolClient;site:string;record:FactCoverageWitnessRecord;state:State}>();
/** Runtime-only capability. The callback must verify the actual signed isolated
 * restore, all sidecar physical ACKs and latest-journal application. It is not
 * an HTTP input or a substitute for the source witness/state/closure checks. */
export async function captureRestoreRebuildCoverage(c:PoolClient,site:string,assertSignedRestorePrerequisites:()=>Promise<void>):Promise<RestoreRebuildCoverageToken|null>{
 const prior=await captureFactCoverageWitness(c,site);if(!prior)return null;
 await assertSignedRestorePrerequisites();
 const source=priors.get(prior)!;const state=await current(c,site);
 const record=await load(c,site);if(!record||record.seal!==source.record.seal||!sameState(record,state))throw Error('FACT_COVERAGE_RESTORE_REBUILD_SOURCE');
 const summary=await closure(c,site);if(summary.digest!==record.closure_digest||summary.rows!==record.closure_rows)throw Error('FACT_COVERAGE_CLOSURE_MISMATCH');
 const token=Object.freeze({kind:'fact_coverage_restore_rebuild' as const});rebuildSources.set(token,{client:c,site,record,state});return token;
}
/** Exactly the runtime's single epoch reset. Dirty state remains unreadable;
 * the subsequent authenticated FULL producer must publish before verification. */
export async function advanceRestoreRebuildCoverage(c:PoolClient,site:string,token:RestoreRebuildCoverageToken|null){
 if(!token)return;
 const source=rebuildSources.get(token);if(!source||source.client!==c||source.site!==site)throw Error('FACT_COVERAGE_RESTORE_REBUILD_SCOPE');
 const existing=await load(c,site),state=await current(c,site);
 const nextGeneration=BigInt(source.state.generation)+1n;
 const nextNonEvent=BigInt(source.state.non_event_generation)>nextGeneration?BigInt(source.state.non_event_generation):nextGeneration;
 if(!existing||existing.seal!==source.record.seal||state.epoch===source.state.epoch||state.generation!==String(nextGeneration)||state.processed_generation!=='0'||state.non_event_generation!==String(nextNonEvent)||state.canonical_epoch!==source.state.canonical_epoch||state.deletion_epoch!==source.state.deletion_epoch||state.configHash!==source.state.configHash)throw Error('FACT_COVERAGE_RESTORE_REBUILD_FENCE');
 const summary=await closure(c,site),{seal:ignored,...body}=source.record;void ignored;
 await write(c,{...body,aggregation_epoch:state.epoch,processed_generation:state.processed_generation,non_event_generation:state.non_event_generation,closure_digest:summary.digest,closure_rows:summary.rows},state.secret);
 rebuildSources.delete(token);
}

export interface RevenueIntakeCoverageToken {readonly kind:'fact_coverage_revenue_intake'}
const revenueSources=new WeakMap<RevenueIntakeCoverageToken,{client:PoolClient;site:string;record:FactCoverageWitnessRecord;state:State}>();
/** Collector-only capability, before validated retained revenue intake. Caller
 * must exclude identify/replay/heatmap and validate fresh accepted timestamps.
 * This token never claims the new, not-yet-aggregated revenue as covered. */
export async function captureRevenueIntakeCoverage(c:PoolClient,site:string):Promise<RevenueIntakeCoverageToken|null>{
 const prior=await captureFactCoverageWitness(c,site);if(!prior)return null;
 const source=priors.get(prior)!;const state=await current(c,site);
 const token=Object.freeze({kind:'fact_coverage_revenue_intake' as const});revenueSources.set(token,{client:c,site,record:source.record,state});return token;
}
/** After real canonical durable ACK and the collector's one dirtySite update.
 * No source body/seal is rewritten; the owner closure must remain identical. */
export async function advanceRevenueIntakeCoverage(c:PoolClient,site:string,token:RevenueIntakeCoverageToken|null){
 if(!token)return;
 const source=revenueSources.get(token);if(!source||source.client!==c||source.site!==site)throw Error('FACT_COVERAGE_REVENUE_SCOPE');
 const existing=await load(c,site),state=await current(c,site);
 const nextGeneration=BigInt(source.state.generation)+1n;
 const nextNonEvent=BigInt(source.state.non_event_generation)>nextGeneration?BigInt(source.state.non_event_generation):nextGeneration;
 if(!existing||existing.seal!==source.record.seal||state.epoch!==source.state.epoch||state.generation!==String(nextGeneration)||state.processed_generation!==source.state.processed_generation||state.non_event_generation!==String(nextNonEvent)||state.canonical_epoch!==source.state.canonical_epoch||state.deletion_epoch!==source.state.deletion_epoch||state.configHash!==source.state.configHash)throw Error('FACT_COVERAGE_REVENUE_FENCE');
 const summary=await closure(c,site);if(summary.digest!==source.record.closure_digest||summary.rows!==source.record.closure_rows)throw Error('FACT_COVERAGE_CLOSURE_MISMATCH');
 const {seal:ignored,...body}=source.record;void ignored;
 await write(c,{...body,non_event_generation:state.non_event_generation},state.secret);
 revenueSources.delete(token);
}

/** Conservative strict-source rebuild guard. An expanded raw-retention window
 * does not prove that already-expired closed sessions can be reconstructed. */
export function assertStrictRetainedWindowContinuity(input:{strict:boolean;authority:string|null;retainedFrom:Date;previousRetainedFrom:Date|null;hasPublishedBaseline?:boolean}){
 if(!input.strict||input.authority!=='clickhouse')return;
 if(input.previousRetainedFrom===null){if(input.hasPublishedBaseline)throw Error('FACT_RETAINED_WINDOW_BASELINE_UNAVAILABLE');return;}
 if(!Number.isFinite(+input.retainedFrom)||!Number.isFinite(+input.previousRetainedFrom))throw Error('FACT_RETAINED_WINDOW_BOUNDARY_INVALID');
 if(+input.retainedFrom<+input.previousRetainedFrom)throw Error('FACT_RETAINED_WINDOW_EXPANSION_UNPROVEN');
}
