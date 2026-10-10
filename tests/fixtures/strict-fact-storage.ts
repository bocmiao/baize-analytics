import {randomBytes} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import type {Pool} from 'pg';
import {lockSite} from '../../src/server/db.js';
import type {ClickHouseSessionHeaderStore} from '../../src/server/session-header-store.js';
import type {ClickHouseFactStore} from '../../src/server/fact-store.js';
import type {ClickHouseRemainingFactStore} from '../../src/server/remaining-fact-store.js';
import type {ClickHouseCacheStore} from '../../src/server/cache-store.js';
import {migratePublishedHeaderClosure} from '../../src/server/session-header-publication.js';
import {migratePublishedFactClosure} from '../../src/server/fact-closure-migration.js';
import {migratePublishedCacheClosure} from '../../src/server/cache-closure-migration.js';
import {backupSessionHeaders} from '../../src/server/session-header-backup.js';
import {backupFactBodies} from '../../src/server/fact-body-backup.js';
import {backupRemainingBodies} from '../../src/server/remaining-body-backup.js';
import {backupCacheBodies} from '../../src/server/cache-body-backup.js';
import {loadVerifiedFactBackup} from '../../src/server/fact-backup-readiness.js';
import {activateStrictFactBodies} from '../../src/server/strict-fact-storage.js';
/** Test-only reuse of the real closure/backup activation sequence. Caller must
 * first perform authenticated canonical migration and rebuild selected runs.
 * No body_mode/authority SQL shortcut and no synthetic readiness proof. */
export async function activateStrictFixture(input:{pool:Pool;siteId:string;directory:string;journalDirectory:string;stores:{headers:ClickHouseSessionHeaderStore;facts:ClickHouseFactStore;remaining:ClickHouseRemainingFactStore;cache:ClickHouseCacheStore}}){
 const {pool,siteId,stores}=input,client=await pool.connect(),key=randomBytes(32),packages=join(input.directory,'strict-packages');
 try{await client.query('BEGIN');await lockSite(client,siteId);const state=(await client.query('SELECT a.epoch,c.epoch canonical,c.deletion_epoch::text deletion,a.generation::text generation FROM aggregation_state a JOIN canonical_event_authority c USING(site_id) WHERE a.site_id=$1',[siteId])).rows[0];if(!state)throw Error('STRICT_FIXTURE_CANONICAL_REQUIRED');const fence={expectedAggregationEpoch:state.epoch,expectedCanonicalEpoch:state.canonical,expectedDeletionEpoch:state.deletion,expectedGeneration:state.generation,verifyLiveFence:async()=>{}};
 await migratePublishedHeaderClosure(client,stores.headers,siteId,fence);await migratePublishedFactClosure(client,siteId,{facts:stores.facts,remaining:stores.remaining},fence);await migratePublishedCacheClosure(client,stores.cache,siteId,fence);await mkdir(packages,{mode:0o700});await backupSessionHeaders(client,stores.headers,join(packages,'headers'),key);await backupFactBodies(client,stores.facts,join(packages,'facts'),key);await backupRemainingBodies(client,stores.remaining,join(packages,'remaining'),key);await backupCacheBodies(client,stores.cache,join(packages,'caches'),key);const proof=await loadVerifiedFactBackup(client,{packageDirectory:packages,journalDir:input.journalDirectory,key,stores,scope:'all'});const result=await activateStrictFactBodies(client,siteId,proof,{facts:stores.facts,remaining:stores.remaining});await client.query('COMMIT');return result;
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}

/** Before canonical activation, backfill the actual published PG owner closure. */
export async function migrateStrictFixtureSources(input:{pool:Pool;siteId:string;stores:{headers:ClickHouseSessionHeaderStore;facts:ClickHouseFactStore;remaining:ClickHouseRemainingFactStore}}){const c=await input.pool.connect();try{await c.query('BEGIN');await lockSite(c,input.siteId);const s=(await c.query('SELECT a.epoch,c.epoch canonical,c.deletion_epoch::text deletion,a.generation::text generation FROM aggregation_state a JOIN canonical_event_authority c USING(site_id) WHERE a.site_id=$1',[input.siteId])).rows[0];if(!s)throw Error('STRICT_FIXTURE_CANONICAL_REQUIRED');const fence={expectedAggregationEpoch:s.epoch,expectedCanonicalEpoch:s.canonical,expectedDeletionEpoch:s.deletion,expectedGeneration:s.generation,verifyLiveFence:async()=>{}};await migratePublishedHeaderClosure(c,input.stores.headers,input.siteId,fence);await migratePublishedFactClosure(c,input.siteId,{facts:input.stores.facts,remaining:input.stores.remaining},fence);await c.query('COMMIT')}catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}}
