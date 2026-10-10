import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {lockSite} from './db.js';
import {selectedFactRunPredicate,assertFactRunClosure} from './fact-run-closure.js';
import {assertVerifiedFactBackup,type VerifiedFactBackup} from './fact-backup-readiness.js';
import {verifyPublishedFactBodies} from './fact-body-verification.js';
import type {ClickHouseFactStore} from './fact-store.js';
import type {ClickHouseRemainingFactStore} from './remaining-fact-store.js';

const factTables=['analytics_vital_samples','analytics_effect_facts','analytics_numeric_facts','analytics_member_facts','analytics_session_facts','analytics_carry_keys','analytics_carry_checkpoints'] as const;
/** Only staging rows are disposable without a per-run backup. They have already
 * been durably sealed into CH, but remain inside the fresh publication transaction.
 * A missing complete marker never becomes an empty successful dataset. */
export async function discardStrictRunStaging(c:PoolClient,site:string,run:string){
 const authority=(await c.query("SELECT authority,body_mode FROM canonical_event_authority WHERE site_id=$1",[site])).rows[0];
 if(authority?.body_mode!=='strict')return {pruned:false};
 if(authority.authority!=='clickhouse')throw Error('FACT_STRICT_AUTHORITY_REQUIRED');
 const r=(await c.query("SELECT r.id FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id JOIN canonical_event_authority v ON v.site_id=r.site_id WHERE r.id=$1 AND r.site_id=$2 AND r.status='published' AND r.epoch=a.epoch AND r.source_authority='clickhouse' AND r.canonical_epoch=v.epoch AND r.canonical_deletion_epoch=v.deletion_epoch",[run,site])).rows[0];
 if(!r)throw Error('FACT_STRICT_PUBLICATION_FENCE');
 await assertCompleteRun(c,site,run);
 for(const table of factTables)await c.query(`DELETE FROM ${table} WHERE run_id=$1`,[run]);
 // V2 exact event samples are in 044; compatibility centroids are redundant.
 await c.query('DELETE FROM analytics_vitals_facts WHERE run_id=$1',[run]);
 await c.query('DELETE FROM analytics_session_event_headers WHERE run_id=$1',[run]);
 return {pruned:true};
}
async function assertCompleteRun(c:PoolClient,site:string,run:string){
 const ready=(await c.query(`SELECT (SELECT count(*) FROM analytics_fact_store_runs f WHERE f.site_id=$1 AND f.run_id=$2 AND f.state='complete' AND f.aggregation_epoch=a.epoch)=2 AND (SELECT count(*) FROM analytics_remaining_fact_runs f WHERE f.site_id=$1 AND f.run_id=$2 AND f.state='complete' AND f.aggregation_epoch=a.epoch)=5 AND EXISTS(SELECT 1 FROM analytics_header_runs h WHERE h.site_id=$1 AND h.run_id=$2 AND h.aggregation_epoch=a.epoch) ready FROM aggregation_state a WHERE a.site_id=$1`,[site,run])).rows[0]?.ready;
 if(!ready)throw Error('FACT_STRICT_RUN_NOT_MIGRATED');
}
/** Admin/CLI entry uses a privately issued, exact sealed backup proof. Holds the
 * same P/site and state row through verification, mode switch and physical PG
 * pruning, so a transition-mode worker cannot publish behind the switch.
 * No authority activation and no weakening of a missing historical owner. */
export async function activateStrictFactBodies(c:PoolClient,site:string,proof:VerifiedFactBackup,stores:{facts:ClickHouseFactStore;remaining:ClickHouseRemainingFactStore}){
 await lockSite(c,site);
 const state=(await c.query("SELECT a.epoch,a.generation::text,a.processed_generation::text,a.lease_until>clock_timestamp() leased,v.authority,v.body_mode FROM aggregation_state a JOIN canonical_event_authority v ON v.site_id=a.site_id WHERE a.site_id=$1 FOR UPDATE OF a,v",[site])).rows[0];
 if(!state||state.authority!=='clickhouse'||state.generation!==state.processed_generation||state.leased)throw Error('FACT_STRICT_CUTOVER_FENCE');
 if(proof.scope!=='all')throw Error('FACT_STRICT_COMPLETE_BACKUP_REQUIRED');
 await assertFactRunClosure(c,site);
 // A cache privacy/expiry invalidation is negative coverage evidence, never a
 // license to erase the sole remaining historical baseline.
 if((await c.query('SELECT 1 FROM analytics_cache_unavailable WHERE site_id=$1 LIMIT 1',[site])).rowCount)throw Error('FACT_STRICT_CACHE_BASELINE_UNAVAILABLE');
 for(const kind of ['hourly_rollup','daily_rollup','page_centroid','legacy_centroid','heatmap_cache'])if(!(await c.query("SELECT 1 FROM analytics_cache_owners o WHERE site_id=$1 AND kind=$2 AND state='complete' AND aggregation_epoch=$3 AND generation<=$4 LIMIT 1",[site,kind,state.epoch,state.processed_generation])).rowCount)throw Error('FACT_STRICT_CACHE_NOT_MIGRATED');
 const cursor='strict_closure_'+randomUUID().replaceAll('-','');let runs=0;
 await c.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT r.id,r.query_version FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id WHERE r.site_id=$1 AND ${selectedFactRunPredicate} ORDER BY r.id`,[site]);
 try{for(;;){const rows=(await c.query(`FETCH 100 FROM ${cursor}`)).rows;if(!rows.length)break;for(const row of rows){await assertCompleteRun(c,site,row.id);await assertVerifiedFactBackup(c,site,row.id,proof);await verifyPublishedFactBodies(c,site,row.id,stores);if(!(await c.query("SELECT 1 FROM analytics_cache_owners WHERE site_id=$1 AND owner_id=$2 AND kind='legacy_centroid' AND state='complete' AND aggregation_epoch=$3",[site,row.id,state.epoch])).rowCount)throw Error('FACT_STRICT_LEGACY_CENTROID_NOT_MIGRATED');runs++;}}}finally{await c.query(`CLOSE ${cursor}`);}
 if(!runs)throw Error('FACT_STRICT_PUBLISHED_HEAD_REQUIRED');
 // Check the proof for the whole closure before changing a single body vector.
 await c.query("UPDATE canonical_event_authority SET body_mode='strict' WHERE site_id=$1",[site]);
 const owners=`SELECT r.id FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id WHERE r.site_id=$1 AND ${selectedFactRunPredicate}`;
 for(const table of [...factTables,'analytics_vitals_facts','analytics_session_event_headers'])await c.query(`DELETE FROM ${table} WHERE run_id IN(${owners})`,[site]);
 // Bucket timestamps/generation/version remain control metadata. Legacy cache
 // body is read through immutable 048 pointers; V2 numbers use exact 044/047.
 for(const table of ['stats_hourly','stats_daily'])await c.query(`UPDATE ${table} SET data=CASE WHEN data->>'relationalVersion'='2' THEN jsonb_build_object('relationalVersion',2) ELSE jsonb_build_object('cacheBodyStored',true) END || CASE WHEN data ? 'relationalUnavailable' THEN jsonb_build_object('relationalUnavailable',data->'relationalUnavailable') ELSE '{}'::jsonb END WHERE site_id=$1`,[site]);
 for(const table of ['page_vitals','heatmap_points','sessions','analytics_definitions'])await c.query(`DELETE FROM ${table} WHERE site_id=$1`,[site]);
 return {strict:true,runs,authority:'clickhouse' as const};
}
