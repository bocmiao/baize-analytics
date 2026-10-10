import {createHash,createHmac,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {DeletionRecord} from './deletion.js';
import {canonical} from './security.js';
import {assertSessionContributionOwners} from './session-contribution-overlay.js';

import {selectedFactRunPredicate,assertFactRunClosure} from './fact-run-closure.js';

/** Hash ordered owner/run/publication metadata through a cursor, not an array
 * of all visitors. Only the digest and count survive in the receipt. */
export async function selectedFactClosure(client:PoolClient,siteId:string,options:{forRebuild?:boolean}={}){
 if(!options.forRebuild)await assertSessionContributionOwners(client,siteId);await assertFactRunClosure(client,siteId,options);
 const selected=options.forRebuild?selectedFactRunPredicate.replaceAll('a.processed_generation','a.generation'):selectedFactRunPredicate;
 const cursor=`cutover_closure_${randomUUID().replaceAll('-','')}`,hash=createHash('sha256');let count=0;
 const hasRemaining=(await client.query("SELECT to_regclass('analytics_remaining_fact_runs') IS NOT NULL AS present")).rows[0].present;
 const remaining=hasRemaining?` UNION ALL SELECT 'remaining-kind',m.run_id::text||':'||m.kind,to_jsonb(m) FROM analytics_remaining_fact_runs m JOIN selected r ON r.id=m.run_id WHERE m.site_id=$1
 UNION ALL SELECT 'remaining-batch',b.id::text,to_jsonb(b) FROM analytics_remaining_fact_batches b JOIN selected r ON r.id=b.run_id WHERE b.site_id=$1`:'';

 const hasCaches=(await client.query("SELECT to_regclass('analytics_cache_owners') IS NOT NULL AS present")).rows[0].present;
 const caches=hasCaches?` UNION ALL SELECT 'cache-owner',o.owner_id::text||':'||o.kind,to_jsonb(o) FROM analytics_cache_owners o WHERE o.site_id=$1 AND ((o.state='complete' AND o.row_count=0) OR EXISTS(SELECT 1 FROM analytics_cache_pointers p WHERE p.site_id=o.site_id AND p.owner_id=o.owner_id AND p.kind=o.kind) OR(o.kind='legacy_centroid' AND EXISTS(SELECT 1 FROM selected r WHERE r.id=o.owner_id)))
 UNION ALL SELECT 'cache-pointer',p.kind||':'||p.row_key,to_jsonb(p) FROM analytics_cache_pointers p WHERE p.site_id=$1
 UNION ALL SELECT 'cache-batch',b.id::text,to_jsonb(b) FROM analytics_cache_batches b WHERE b.site_id=$1 AND EXISTS(SELECT 1 FROM analytics_cache_owners o WHERE o.site_id=b.site_id AND o.owner_id=b.owner_id AND o.kind=b.kind AND((o.state='complete' AND o.row_count=0) OR EXISTS(SELECT 1 FROM analytics_cache_pointers p WHERE p.site_id=o.site_id AND p.owner_id=o.owner_id AND p.kind=o.kind) OR(o.kind='legacy_centroid' AND EXISTS(SELECT 1 FROM selected r WHERE r.id=o.owner_id))))
 UNION ALL SELECT 'cache-member',m.owner_id::text||':'||m.kind||':'||m.row_key,to_jsonb(m) FROM analytics_cache_members m WHERE m.site_id=$1 AND EXISTS(SELECT 1 FROM analytics_cache_owners o WHERE o.site_id=m.site_id AND o.owner_id=m.owner_id AND o.kind=m.kind AND(EXISTS(SELECT 1 FROM analytics_cache_pointers p WHERE p.site_id=o.site_id AND p.owner_id=o.owner_id AND p.kind=o.kind) OR(o.kind='legacy_centroid' AND EXISTS(SELECT 1 FROM selected r WHERE r.id=o.owner_id))))
 UNION ALL SELECT 'cache-heatmap-coverage',b.owner_id::text||':'||b.batch_id::text,to_jsonb(b) FROM cache_heatmap_coverage_batches b WHERE b.site_id=$1 AND EXISTS(SELECT 1 FROM analytics_cache_pointers p WHERE p.site_id=b.site_id AND p.owner_id=b.owner_id AND p.kind='heatmap_cache')
 UNION ALL SELECT 'cache-unavailable',u.kind,to_jsonb(u) FROM analytics_cache_unavailable u WHERE u.site_id=$1`:'';

 await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR WITH selected AS(SELECT r.* FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id WHERE r.site_id=$1 AND ${selected}), metadata AS(
 SELECT 'run' kind,r.id::text key,to_jsonb(r) body FROM selected r
 UNION ALL SELECT 'hour',b.hour::text,to_jsonb(b) FROM analytics_relational_buckets b JOIN selected r ON r.id=b.run_id WHERE b.site_id=$1
 UNION ALL SELECT 'carry',h.visitor_id,to_jsonb(h) FROM analytics_carry_heads h JOIN selected r ON r.id=h.run_id WHERE h.site_id=$1
 UNION ALL SELECT 'owner',h.session_id::text,to_jsonb(h) FROM analytics_session_contribution_heads h JOIN selected r ON r.id=h.run_id WHERE h.site_id=$1
 UNION ALL SELECT 'header-batch',b.id::text,to_jsonb(b) FROM analytics_header_batches b JOIN selected r ON r.id=b.run_id WHERE b.site_id=$1
 UNION ALL SELECT 'fact-kind',m.run_id::text||':'||m.kind,to_jsonb(m) FROM analytics_fact_store_runs m JOIN selected r ON r.id=m.run_id WHERE m.site_id=$1
 UNION ALL SELECT 'fact-batch',b.id::text,to_jsonb(b) FROM analytics_fact_store_batches b JOIN selected r ON r.id=b.run_id WHERE b.site_id=$1
 UNION ALL SELECT 'effects',e.run_id::text||':'||e.event_id::text||':'||e.session_id::text||':'||e.metric||':'||e.key::text||':'||e.member::text,to_jsonb(e) FROM analytics_effect_facts e JOIN selected r ON r.id=e.run_id
 UNION ALL SELECT 'vitals',e.run_id::text||':'||e.event_id::text||':'||e.metric,to_jsonb(e) FROM analytics_vital_samples e JOIN selected r ON r.id=e.run_id
 UNION ALL SELECT 'headers',e.run_id::text||':'||e.event_id::text,to_jsonb(e) FROM analytics_session_event_headers e JOIN selected r ON r.id=e.run_id
 UNION ALL SELECT 'checkpoint',e.run_id::text||':'||e.visitor_id,to_jsonb(e) FROM analytics_carry_checkpoints e JOIN selected r ON r.id=e.run_id
 UNION ALL SELECT 'carry-key',e.run_id::text||':'||e.visitor_id||':'||e.kind||':'||e.key,to_jsonb(e) FROM analytics_carry_keys e JOIN selected r ON r.id=e.run_id
 UNION ALL SELECT 'session',e.run_id::text||':'||e.session_id::text,to_jsonb(e) FROM analytics_session_facts e JOIN selected r ON r.id=e.run_id
 UNION ALL SELECT 'numerics',e.run_id::text||':'||e.session_id::text||':'||e.bucket_kind||':'||e.bucket||':'||e.metric||':'||e.key::text,to_jsonb(e) FROM analytics_numeric_facts e JOIN selected r ON r.id=e.run_id
 UNION ALL SELECT 'members',e.run_id::text||':'||e.session_id::text||':'||e.bucket_kind||':'||e.bucket||':'||e.metric||':'||e.key::text||':'||e.visitor_id,to_jsonb(e) FROM analytics_member_facts e JOIN selected r ON r.id=e.run_id
 UNION ALL SELECT 'rebuild-request',e.run_id::text||':'||e.session_id::text,to_jsonb(e) FROM analytics_session_rebuild_requests e JOIN selected r ON r.id=e.run_id WHERE e.site_id=$1
 UNION ALL SELECT 'legacy-vitals',e.run_id::text||':'||e.bucket_kind||':'||e.bucket||':'||e.path||':'||e.metric,to_jsonb(e) FROM analytics_vitals_facts e JOIN selected r ON r.id=e.run_id
 ${remaining}${caches}) SELECT kind,key,body FROM metadata ORDER BY kind,key,body::text`,[siteId]);
 try{while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows;if(!rows.length)break;for(const row of rows){hash.update(canonical(row)+'\n');count++;}}}finally{await client.query(`CLOSE ${cursor}`);}
 return {hash:hash.digest('hex'),count};
}

/** Call before changing authority, in the same gated activation transaction. */
export async function captureCanonicalCutoverReceipt(client:PoolClient,siteId:string){
 const state=(await client.query(`SELECT s.epoch,s.generation::text,s.processed_generation::text,c.authority,c.epoch AS canonical_epoch,c.deletion_epoch::text,p.epoch AS progress_epoch,p.validated_generation::text,p.validated_deletion_epoch::text,p.validated_at,p.validated_privacy_mode,p.validated_daily_columns_version,t.privacy_mode FROM aggregation_state s JOIN canonical_event_authority c USING(site_id) JOIN canonical_migration_progress p USING(site_id) JOIN sites t ON t.id=s.site_id WHERE s.site_id=$1`,[siteId])).rows[0];
 const head=(await client.query("SELECT id,epoch,generation::text,source_authority FROM analytics_fact_runs WHERE site_id=$1 AND query_version=2 AND status='published' ORDER BY generation DESC,created_at DESC LIMIT 1",[siteId])).rows[0];
 if(!state||state.authority!=='postgres'||state.generation!==state.processed_generation||state.progress_epoch!==state.canonical_epoch||!state.validated_at||state.validated_generation!==state.generation||state.validated_deletion_epoch!==state.deletion_epoch||state.validated_privacy_mode!==state.privacy_mode||(state.privacy_mode==='daily_salt'&&state.validated_daily_columns_version!==1)||(head&&(head.epoch!==state.epoch||head.source_authority!=='postgres'||head.generation!==state.processed_generation))||(!head&&state.processed_generation!=='0'))throw Error('CANONICAL_CUTOVER_PROOF_REQUIRED');
 if((await client.query('SELECT 1 FROM analytics_session_rebuild_requests WHERE site_id=$1 LIMIT 1',[siteId])).rowCount)throw Error('CANONICAL_CUTOVER_REBUILD_PENDING');
 const closure=await selectedFactClosure(client,siteId);
 await client.query('INSERT INTO canonical_cutover_receipts(site_id,old_head_run,aggregation_epoch,processed_generation,canonical_epoch,deletion_epoch,validated_generation,closure_hash,closure_count)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[siteId,head?.id??null,state.epoch,state.processed_generation,state.canonical_epoch,state.deletion_epoch,state.validated_generation,closure.hash,closure.count]);
 return {headRun:head?.id??null,...closure};
}

/** Read-only checks cannot request this exception. A rebuilding caller may use
 * the old PG archive only while its exact cutover proof still matches. */
export async function verifyCanonicalCutoverReceipt(client:PoolClient,siteId:string,headRun:string){
 const row=(await client.query(`SELECT q.*,s.epoch AS live_epoch,s.generation::text AS live_generation,s.processed_generation::text AS live_processed,c.authority,c.epoch AS live_canonical,c.deletion_epoch::text AS live_deletion,p.validated_generation::text AS live_validated,p.validated_deletion_epoch::text AS validated_deletion,p.epoch AS validation_epoch,p.validated_at,r.epoch AS head_epoch,r.source_authority FROM canonical_cutover_receipts q JOIN aggregation_state s USING(site_id) JOIN canonical_event_authority c USING(site_id) JOIN canonical_migration_progress p USING(site_id) JOIN analytics_fact_runs r ON r.id=q.old_head_run WHERE q.site_id=$1`,[siteId])).rows[0];
 const repaired=Boolean(row?.repaired_at);
 const expectedEpoch=repaired?row.repair_aggregation_epoch:row?.aggregation_epoch;
 const expectedProcessed=repaired?String(row.repair_processed_generation):String(row?.processed_generation);
 const expectedDeletion=repaired?String(row.repair_deletion_epoch):String(row?.deletion_epoch);
 if(!row||row.old_head_run!==headRun||row.head_epoch!==expectedEpoch||row.source_authority!=='postgres'||row.live_epoch!==expectedEpoch||row.authority!=='clickhouse'||row.live_canonical!==row.canonical_epoch||expectedDeletion!==row.live_deletion||expectedProcessed!==row.live_processed||BigInt(row.live_generation)<=BigInt(row.live_processed)||String(row.validated_generation)!==row.live_validated||row.validation_epoch!==row.canonical_epoch||row.validated_deletion!==String(row.deletion_epoch)||!row.validated_at||(repaired&&!row.repair_journal_scope))throw Error('CANONICAL_CUTOVER_PROOF_STALE');
 if(!repaired&&(await client.query('SELECT 1 FROM analytics_session_rebuild_requests WHERE site_id=$1 LIMIT 1',[siteId])).rowCount)throw Error('CANONICAL_CUTOVER_REBUILD_PENDING');
 const closure=await selectedFactClosure(client,siteId,{forRebuild:repaired});
 if(closure.hash!==(repaired?row.repair_closure_hash:row.closure_hash)||String(closure.count)!==String(repaired?row.repair_closure_count:row.closure_count))throw Error('CANONICAL_CUTOVER_CLOSURE_CHANGED');
 return true;
}

export interface CutoverPrivacyRepairToken {readonly kind:'cutover-privacy-repair'}
const privacyRepairs=new WeakMap<CutoverPrivacyRepairToken,{client:PoolClient;siteId:string;headRun:string;canonicalEpoch:string;deletionEpoch:string;journalScope:string}>();
/** The source record set is checked against the fsync/watermark-verified journal,
 * never accepted as a caller-provided scope string. Dynamic import avoids the
 * deletion -> invalidation -> source -> receipt dependency cycle at startup. */
export async function captureCanonicalCutoverPrivacyRepair(client:PoolClient,siteId:string,dataDir:string,records:DeletionRecord[]):Promise<CutoverPrivacyRepairToken|null>{
 const head=(await client.query("SELECT r.id,r.source_authority,c.authority,c.epoch,c.deletion_epoch::text,s.salt_secret FROM analytics_fact_runs r JOIN sites s ON s.id=r.site_id LEFT JOIN canonical_event_authority c ON c.site_id=r.site_id WHERE r.site_id=$1 AND r.query_version=2 AND r.status='published' ORDER BY r.generation DESC,r.created_at DESC LIMIT 1",[siteId])).rows[0];
 if(!head||head.source_authority!=='postgres'||head.authority!=='clickhouse')return null;
 await verifyCanonicalCutoverReceipt(client,siteId,head.id);
 if(!records.length||records.some(record=>record.site_id!==siteId))throw Error('CANONICAL_CUTOVER_JOURNAL_REQUIRED');
 const {readVerifiedDeletionRecords}=await import('./deletion.js');const verified=await readVerifiedDeletionRecords(dataDir),actual=records.map(record=>canonical(record)).sort();
 for(const record of actual)if(!verified.some(candidate=>canonical(candidate)===record))throw Error('CANONICAL_CUTOVER_JOURNAL_REQUIRED');
 const journalScope=createHmac('sha256',head.salt_secret).update(canonical(['canonical-cutover-privacy-repair-v1',siteId,actual])).digest('hex');
 const token:CutoverPrivacyRepairToken=Object.freeze({kind:'cutover-privacy-repair'});privacyRepairs.set(token,{client,siteId,headRun:head.id,canonicalEpoch:head.epoch,deletionEpoch:head.deletion_epoch,journalScope});return token;
}
/** Caller has completed physical ACK, precise body invalidation and epoch
 * rebasing under the same site gate. This is repair input authorization only. */
export async function finalizeCanonicalCutoverPrivacyRepair(client:PoolClient,token:CutoverPrivacyRepairToken|null){
 if(!token)return;const captured=privacyRepairs.get(token);if(!captured||captured.client!==client)throw Error('CANONICAL_CUTOVER_REPAIR_TOKEN_INVALID');
 const state=(await client.query("SELECT a.epoch,a.generation::text,a.processed_generation::text,c.authority,c.epoch AS canonical_epoch,c.deletion_epoch::text,r.id AS head_run,r.epoch AS head_epoch,r.source_authority FROM aggregation_state a JOIN canonical_event_authority c USING(site_id) JOIN LATERAL(SELECT * FROM analytics_fact_runs WHERE site_id=a.site_id AND query_version=2 AND status='published' ORDER BY generation DESC,created_at DESC LIMIT 1) r ON true WHERE a.site_id=$1",[captured.siteId])).rows[0];
 if(!state||state.head_run!==captured.headRun||state.source_authority!=='postgres'||state.head_epoch!==state.epoch||state.authority!=='clickhouse'||state.canonical_epoch!==captured.canonicalEpoch||BigInt(state.deletion_epoch)<BigInt(captured.deletionEpoch)||BigInt(state.generation)<=BigInt(state.processed_generation))throw Error('CANONICAL_CUTOVER_REPAIR_FENCE');
 const closure=await selectedFactClosure(client,captured.siteId,{forRebuild:true});
 const saved=await client.query('UPDATE canonical_cutover_receipts SET repair_aggregation_epoch=$2,repair_processed_generation=$3,repair_deletion_epoch=$4,repair_closure_hash=$5,repair_closure_count=$6,repair_journal_scope=$7,repaired_at=now() WHERE site_id=$1 AND old_head_run=$8 AND canonical_epoch=$9',[captured.siteId,state.epoch,state.processed_generation,state.deletion_epoch,closure.hash,closure.count,captured.journalScope,captured.headRun,captured.canonicalEpoch]);
 if(saved.rowCount!==1)throw Error('CANONICAL_CUTOVER_REPAIR_FENCE');privacyRepairs.delete(token);
}

/** Only the same journal-authorized, gated mutation may read its changing
 * closure before the durable final receipt is published. */
export async function verifyCutoverPrivacyRepairInput(client:PoolClient,siteId:string,headRun:string,token:CutoverPrivacyRepairToken){
 const capture=privacyRepairs.get(token);if(!capture||capture.client!==client||capture.siteId!==siteId||capture.headRun!==headRun)throw Error('CANONICAL_CUTOVER_REPAIR_TOKEN_INVALID');
 const state=(await client.query("SELECT c.authority,c.epoch,c.deletion_epoch::text,r.epoch=a.epoch AS epoch_matches,a.generation>a.processed_generation AS dirty FROM canonical_event_authority c JOIN aggregation_state a USING(site_id) JOIN analytics_fact_runs r ON r.id=$2 AND r.site_id=c.site_id WHERE c.site_id=$1",[siteId,headRun])).rows[0];
 if(!state||state.authority!=='clickhouse'||state.epoch!==capture.canonicalEpoch||BigInt(state.deletion_epoch)<BigInt(capture.deletionEpoch)||!state.epoch_matches||!state.dirty)throw Error('CANONICAL_CUTOVER_REPAIR_FENCE');
 return true;
}
