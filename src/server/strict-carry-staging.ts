import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {getFactStore} from './fact-store.js';
import {getRemainingFactStore} from './remaining-fact-store.js';
import {getSessionHeaderStore} from './session-header-store.js';
import {getCacheStore} from './cache-store.js';
import {verifyPublishedFactBodies} from './fact-body-verification.js';
/** After the deletion ACK and final epoch rebases, verify the replacement's
 * committed sealed closure before dropping transient PG checkpoint/key bodies.
 * Caller holds P/site/header gates and the transaction; never borrow a pool client. */
export async function discardStrictPublishedCarryStaging(c:PoolClient,pool:Pool,site:string){
 if(!(await c.query("SELECT 1 FROM canonical_event_authority WHERE site_id=$1 AND authority='clickhouse' AND body_mode='strict'",[site])).rowCount)return {runs:0};
 const facts=getFactStore(pool),remaining=getRemainingFactStore(pool),headers=getSessionHeaderStore(pool),cache=getCacheStore(pool);
 if(!facts||!remaining||!headers||!cache)throw Error('CARRY_STRICT_STAGING_STORE_REQUIRED');
 const cursor='strict_carry_drop_'+randomUUID().replaceAll('-','');let runs=0;
 await c.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT DISTINCT r.id FROM analytics_fact_runs r JOIN analytics_carry_heads h ON h.run_id=r.id JOIN aggregation_state a ON a.site_id=r.site_id WHERE r.site_id=$1 AND r.status='published' AND r.epoch=a.epoch AND (EXISTS(SELECT 1 FROM analytics_carry_checkpoints x WHERE x.run_id=r.id) OR EXISTS(SELECT 1 FROM analytics_carry_keys x WHERE x.run_id=r.id)) ORDER BY r.id`,[site]);
 try{for(;;){const batch=(await c.query(`FETCH 100 FROM ${cursor}`)).rows;if(!batch.length)break;for(const {id}of batch){
  const verified=await verifyPublishedFactBodies(c,site,id,{facts,remaining});
  let headerRows=0;for await(const records of headers.streamRows(c,site,id)){if(records.length>100)throw Error('CARRY_STRICT_HEADER_BATCH_LIMIT');headerRows+=records.length;}
  if(!(await c.query("SELECT 1 FROM analytics_cache_owners WHERE site_id=$1 AND owner_id=$2 AND kind='legacy_centroid' AND state='complete'",[site,id])).rowCount){
   // All-site cache erasure removed the earlier zero receipt. Re-establish
   // only this controlled carry-only run's redundant centroid zero, proven
   // by its surviving authenticated zero event/vital/summary kinds.
   if(headerRows||['effects','vitals','sessions','numerics','members'].some(kind=>verified[kind as keyof typeof verified]?.rows!==0)||(await c.query('SELECT 1 FROM analytics_vitals_facts WHERE run_id=$1 LIMIT 1',[id])).rowCount)throw Error('CARRY_STRICT_CENTROID_ZERO_UNPROVEN');
   const state=(await c.query("SELECT a.epoch,a.generation::text,v.epoch canonical,v.deletion_epoch::text deletion FROM aggregation_state a JOIN canonical_event_authority v USING(site_id) WHERE a.site_id=$1 AND v.authority='clickhouse' AND v.body_mode='strict'",[site])).rows[0];
   if(!state)throw Error('CARRY_STRICT_PUBLICATION_FENCE');
   await cache.completeOwnerKind(c,site,id,'legacy_centroid',0,{expectedAggregationEpoch:state.epoch,expectedGeneration:state.generation,expectedCanonicalEpoch:state.canonical,expectedDeletionEpoch:state.deletion,verifyLiveFence:async()=>{const live=(await c.query('SELECT a.epoch,a.generation::text,v.epoch canonical,v.deletion_epoch::text deletion FROM aggregation_state a JOIN canonical_event_authority v USING(site_id) WHERE a.site_id=$1',[site])).rows[0];if(!live||live.epoch!==state.epoch||live.generation!==state.generation||live.canonical!==state.canonical||live.deletion!==state.deletion)throw Error('CARRY_STRICT_PUBLICATION_FENCE');}});
  }
  for await(const records of cache.streamRows(c,site,id,'legacy_centroid')){if(records.length)throw Error('CARRY_STRICT_UNEXPECTED_CENTROID_BODY');}
  // The replacement's immutable source deletion epoch is intentionally the
  // pre-ACK epoch. Ordinary worker publication must keep its stricter fence.
  // Here all seven committed bodies and rebased live receipts were verified
  // above; drop only carry staging, never rewrite captured source provenance.
  const authorized=(await c.query("SELECT 1 FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id JOIN canonical_event_authority v ON v.site_id=r.site_id JOIN analytics_carry_heads h ON h.run_id=r.id AND h.site_id=r.site_id WHERE r.id=$1 AND r.site_id=$2 AND r.status='published' AND r.query_version=1 AND r.epoch=a.epoch AND h.epoch=a.epoch AND r.source_authority='clickhouse' AND r.canonical_epoch=v.epoch AND r.canonical_deletion_epoch<=v.deletion_epoch AND v.authority='clickhouse' AND v.body_mode='strict'",[id,site])).rowCount;
  if(!authorized||headerRows||['effects','vitals','sessions','numerics','members'].some(kind=>verified[kind as keyof typeof verified]?.rows!==0))throw Error('CARRY_STRICT_PUBLICATION_FENCE');
  await c.query('DELETE FROM analytics_carry_keys WHERE run_id=$1',[id]);
  await c.query('DELETE FROM analytics_carry_checkpoints WHERE run_id=$1',[id]);runs++;
 }}}finally{await c.query(`CLOSE ${cursor}`);}
 return {runs};
}
