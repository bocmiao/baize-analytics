import {requestedFactHydration,assertFactHydrationReuse,selectedFactHydrationPredicate,type FactHydration} from './selected-fact-hydration.js';
import {measurePerformanceStage} from './performance-observation.js';
import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {verifyCanonicalCutoverReceipt,verifyCutoverPrivacyRepairInput,type CutoverPrivacyRepairToken} from './cutover-receipt.js';
import {selectedFactRunPredicate,assertFactRunClosure} from './fact-run-closure.js';
import {factAuthorityMatches} from './fact-authority.js';
import {assertSessionContributionOwners} from './session-contribution-overlay.js';
import {getFactStore} from './fact-store.js';
import {bindFactReadRelations,hasFactReadSource,factReadRelations} from './fact-read-context.js';

export interface FactReadSource {hydration?:FactHydration;source:'postgres'|'clickhouse'|'hybrid';effectsRelation:string;vitalsRelation:string;cleanup:()=>Promise<void>}
export interface FactSourceOptions {hydration?:FactHydration;forRebuild?:boolean;forAuthorityTransition?:boolean;cutoverRepair?:CutoverPrivacyRepairToken}
/** Same-run metadata only: a legacy PG vital still needs unfiltered authenticated identity provenance. */
export function needsFactIdentityWrite(markers:readonly {kind:string;state:string}[]){return !(['effects','vitals'] as const).every(kind=>markers.some(marker=>marker.kind===kind&&marker.state==='complete'));}
export async function assertFactReadSourceFence(client:PoolClient,siteId:string,options:FactSourceOptions={}){
 const head=(await client.query(`SELECT r.id,r.source_authority,c.authority,r.epoch=a.epoch AS epoch_matches,a.generation>a.processed_generation AS dirty,${factAuthorityMatches} AS authority_matches,(r.source_authority='clickhouse' AND c.authority='clickhouse' AND r.canonical_epoch=c.epoch AND r.canonical_deletion_epoch<c.deletion_epoch) AS deletion_advanced FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id LEFT JOIN canonical_event_authority c ON c.site_id=r.site_id WHERE r.site_id=$1 AND r.query_version=2 AND r.status='published' ORDER BY r.generation DESC,r.created_at DESC LIMIT 1`,[siteId])).rows[0];
 let transitionInput=false;
 if((options.forAuthorityTransition===true||options.cutoverRepair)&&head?.epoch_matches&&head.dirty&&head.source_authority==='postgres'&&head.authority==='clickhouse')transitionInput=options.cutoverRepair?await verifyCutoverPrivacyRepairInput(client,siteId,head.id,options.cutoverRepair):await verifyCanonicalCutoverReceipt(client,siteId,head.id);
 const repairInput=options.forRebuild===true&&head?.epoch_matches&&head.dirty&&head.deletion_advanced;
 if(head&&(!head.epoch_matches||(!head.authority_matches&&!repairInput&&!transitionInput)))throw Error('FACT_STORE_SOURCE_FENCE');
 const authenticatedRebuild=head?.epoch_matches&&head.dirty&&((options.forRebuild===true&&(head.authority_matches||repairInput))||transitionInput);
 return Boolean(authenticatedRebuild);
}
/** Transaction-local bounded transport bridge. The caller owns its source
 * fence; the pool only identifies the adapter registry, never a second loan.
 * Returned relation names are generated/quoted here, never user input. */
export async function prepareFactReadSource(client:PoolClient,pool:Pool,siteId:string,options:FactSourceOptions={}):Promise<FactReadSource>{
 const hydration=requestedFactHydration(options);
 const schema=(await client.query('SELECT quote_ident(current_schema()) AS name')).rows[0].name as string;
 const effectsBase=`${schema}.analytics_effect_facts`,vitalsBase=`${schema}.analytics_vital_samples`;
 const authenticatedRebuild=await assertFactReadSourceFence(client,siteId,options);
 const strict=(await client.query("SELECT COALESCE(to_jsonb(c)->>'body_mode','transition')='strict' AS strict FROM canonical_event_authority c WHERE site_id=$1",[siteId])).rows[0]?.strict===true;
 const anyReceipt=(await client.query(`SELECT EXISTS(SELECT 1 FROM analytics_fact_store_runs m JOIN analytics_fact_runs r ON r.id=m.run_id JOIN aggregation_state a ON a.site_id=r.site_id WHERE m.site_id=$1 AND r.status='published' AND r.epoch=a.epoch) AS present`,[siteId])).rows[0].present;
 if(!anyReceipt&&strict&&(await client.query("SELECT 1 FROM analytics_fact_runs WHERE site_id=$1 AND status='published' LIMIT 1",[siteId])).rowCount)throw Error('FACT_STORE_SOURCE_NOT_MIGRATED');
 if(!anyReceipt)return {hydration:'complete',source:'postgres',effectsRelation:effectsBase,vitalsRelation:vitalsBase,cleanup:async()=>{}};
 const store=getFactStore(pool);if(!store)throw Error('FACT_STORE_REQUIRED');
 if(!authenticatedRebuild)await assertSessionContributionOwners(client,siteId);
 await assertFactRunClosure(client,siteId,{forRebuild:Boolean(authenticatedRebuild)});
 const selectedRuns=authenticatedRebuild?selectedFactRunPredicate.replaceAll('a.processed_generation','a.generation'):selectedFactRunPredicate;
 const effects=`fact_effect_stage_${randomUUID().replaceAll('-','')}`,vitals=`fact_vital_stage_${randomUUID().replaceAll('-','')}`,identities=`fact_identity_stage_${randomUUID().replaceAll('-','')}`;
 await client.query(`CREATE TEMP TABLE ${effects}(LIKE ${effectsBase} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES) ON COMMIT DROP`);
 await client.query(`CREATE TEMP TABLE ${vitals}(LIKE ${vitalsBase} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES) ON COMMIT DROP`);
 await client.query(`CREATE TEMP TABLE ${identities}(run_id uuid,event_id uuid,visitor_id text,PRIMARY KEY(run_id,event_id,visitor_id)) ON COMMIT DROP`);
 const cleanup=async()=>{await client.query(`DROP TABLE IF EXISTS ${effects},${vitals},${identities}`);};
 let hasPG=false,hasCH=false;
 const cursor=`fact_source_runs_${randomUUID().replaceAll('-','')}`;let opened=false;
 try{
  await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT r.id FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id WHERE r.site_id=$1 AND ${selectedRuns} ORDER BY r.id`,[siteId]);opened=true;
  while(true){const runs=(await client.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows;if(!runs.length)break;
   for(const run of runs){const markers=(await client.query('SELECT kind,state FROM analytics_fact_store_runs WHERE site_id=$1 AND run_id=$2',[siteId,run.id])).rows as {kind:string;state:string}[];const writeIdentity=needsFactIdentityWrite(markers);for(const kind of['effects','vitals'] as const){
    const target=kind==='effects'?effects:vitals,base=kind==='effects'?effectsBase:vitalsBase;
    const marker=markers.find(marker=>marker.kind===kind);
    if(marker&&marker.state!=='complete')throw Error('FACT_STORE_KIND_INCOMPLETE');
    const migrated=Boolean(marker);
    if(!migrated){if(strict)throw Error('FACT_STORE_SOURCE_NOT_MIGRATED');hasPG=true;
     // Legacy source copying stays wholly in PostgreSQL. Effects have direct
     // identity; legacy vitals must have an authenticated effect provenance.
     if(kind==='effects')await client.query(`INSERT INTO ${identities} SELECT DISTINCT run_id,event_id,visitor_id FROM ${base} WHERE run_id=$1 ON CONFLICT DO NOTHING`,[run.id]);
     const identity=kind==='effects'?'e.visitor_id':'p.visitor_id';
     const join=kind==='effects'?'':`JOIN LATERAL(SELECT DISTINCT visitor_id FROM ${identities} p WHERE p.run_id=e.run_id AND p.event_id=e.event_id) p ON true`;
     if(kind==='vitals'&&(await client.query(`SELECT 1 FROM ${base} e WHERE e.run_id=$1 AND NOT EXISTS(SELECT 1 FROM ${identities} p WHERE p.run_id=e.run_id AND p.event_id=e.event_id) LIMIT 1`,[run.id])).rowCount)throw Error('FACT_STORE_VITAL_PROVENANCE_MISSING');
     await measurePerformanceStage('temp_fill',()=>client.query(`INSERT INTO ${target} SELECT e.* FROM ${base} e ${join} WHERE e.run_id=$2 AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=$1 AND t.visitor_id=${identity}) AND NOT EXISTS(SELECT 1 FROM identity_tombstones t WHERE t.site_id=$1 AND t.visitor_id=${identity} AND t.started_at<=e.event_ts AND t.ended_at>e.event_ts)`,[siteId,run.id]),{adapter:'facts'});
     continue;
    }
    hasCH=true;
    for await(const records of store.streamRunRows(client,siteId,run.id,kind)){
     if(records.length>100)throw Error('FACT_STORE_BATCH_LIMIT');
     for(const record of records)if(record.kind!==kind||record.row.run_id!==run.id||!record.visitorId||!record.sessionId)throw Error('FACT_STORE_RECORD_SCOPE');
     if(!records.length)continue;
     const columns=kind==='effects'?'run_id uuid,event_id uuid,event_ts timestamptz,session_id uuid,visitor_id text,event_path text,dimensions jsonb,metric text,key jsonb,value double precision,member boolean':'run_id uuid,event_id uuid,event_ts timestamptz,event_path text,dimensions jsonb,metric text,value double precision';
     // Legacy PG vitals require the original identity write. Complete CH kinds
     // consume authenticated envelope identity directly, so no identity index write is needed.
     // Both writes consume the same authenticated <=100-row batch. The target
     // uses envelope identity, not newly inserted rows, so conflict dedupe cannot
     // drop multiple effects/vitals belonging to one event. Full authentication
     // above retains the original envelope; SQL uses its authenticated sessionId
      // for optional current-owner projection, including page-less vitals.
     const counts:{adapter:'facts';authenticatedRows?:number;selectedHydratedRows?:number}={adapter:'facts',...(hydration==='selected'?{authenticatedRows:records.length}:{})};
     await measurePerformanceStage('temp_fill',async()=>{const inserted=await client.query(`WITH envelopes AS MATERIALIZED (SELECT * FROM jsonb_to_recordset($2) envelope(row jsonb,"visitorId" text,"sessionId" text))${writeIdentity?`, identity_write AS (INSERT INTO ${identities} SELECT (envelope.row->>'run_id')::uuid,(envelope.row->>'event_id')::uuid,envelope."visitorId" FROM envelopes envelope ON CONFLICT DO NOTHING RETURNING run_id)`:''} INSERT INTO ${target} SELECT r.* FROM envelopes envelope CROSS JOIN LATERAL jsonb_to_record(envelope.row) r(${columns}) WHERE NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=$1 AND t.visitor_id=envelope."visitorId") AND NOT EXISTS(SELECT 1 FROM identity_tombstones t WHERE t.site_id=$1 AND t.visitor_id=envelope."visitorId" AND t.started_at<=r.event_ts AND t.ended_at>r.event_ts) ${hydration==='selected'?`AND ${selectedFactHydrationPredicate}`:''}`, [siteId,JSON.stringify(records.map(({row,visitorId,sessionId})=>({row,visitorId,sessionId})))]);if(hydration==='selected')counts.selectedHydratedRows=inserted.rowCount??0;return inserted;},counts);

    }
   }}
  }
  await client.query(`CLOSE ${cursor}`);opened=false;
  return {hydration:hasCH?hydration:'complete',source:hasCH?(hasPG?'hybrid':'clickhouse'):'postgres',effectsRelation:`pg_temp.${effects}`,vitalsRelation:`pg_temp.${vitals}`,cleanup};
 }catch(error){if(opened)await client.query(`CLOSE ${cursor}`).catch(()=>undefined);await cleanup().catch(()=>undefined);throw error;}
}

export async function withFactReadSource<T>(client:PoolClient,pool:Pool,siteId:string,read:(source:FactReadSource)=>Promise<T>,options:FactSourceOptions={}):Promise<T>{
 if(hasFactReadSource(client)){assertFactHydrationReuse(factReadRelations(client).hydration,options);return read({...factReadRelations(client),source:factReadRelations(client).source??'postgres',cleanup:async()=>{}});}
 const source=await prepareFactReadSource(client,pool,siteId,options),restore=bindFactReadRelations(client,source);
 try{return await read(source);}finally{restore();await source.cleanup();}
}
