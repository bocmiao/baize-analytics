import {describe,it,expect,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {advanceFactCoverageWitness,captureFactCoverageWitness,coverageConfigHash,restoreFactCoverageWitness,withCoverageMetadataUtc,advanceRestoreRebuildCoverage,advanceRevenueIntakeCoverage,assertStrictRetainedWindowContinuity,recordRawRetirementAfterAck,assertRawRetirementWindowContinuity,assertRawRetirementOrigin,initializeNewSiteCoverageOrigin} from '../../src/server/fact-coverage-witness.js';

describe('coverage witness capability and legacy boundaries',()=>{
 it('legacy absent table captures null and advances without accessing canonical authority',async()=>{
  const query=vi.fn(async(sql:string)=>{void sql;return {rows:[{present:null}],rowCount:1};});
  const client={query} as unknown as PoolClient;
  expect(await captureFactCoverageWitness(client,'site')).toBeNull();
  await advanceFactCoverageWitness(client,'site',null,{operation:'privacy_delete'});
  expect(query).toHaveBeenCalledTimes(2);
  for(const [sql] of query.mock.calls)expect(String(sql)).not.toContain('canonical_event_authority');
 });
 it('missing witness on current schema does not authorize a PG transition',async()=>{
  const query=vi.fn(async(sql:string)=>({rows:sql.includes('to_regclass')?[{present:'analytics_fact_coverage_witnesses'}]:[],rowCount:0}));
  const client={query} as unknown as PoolClient;
  await advanceFactCoverageWitness(client,'site',null,{operation:'raw_retention'});
  expect(query).toHaveBeenCalledTimes(2);
  expect(query.mock.calls.every(([sql])=>!sql.includes('canonical_event_authority'))).toBe(true);
 });
 it('rejects caller-created transition and restore tokens before querying',async()=>{
  const query=vi.fn();const client={query} as unknown as PoolClient;
  await expect(advanceFactCoverageWitness(client,'site',{kind:'fact_coverage_prior'},{operation:'privacy_delete'})).rejects.toThrow('FACT_COVERAGE_TOKEN_SCOPE');
  const target=vi.fn(async()=>{});
  await expect(restoreFactCoverageWitness(client,'site',{kind:'fact_coverage_stored_source'},target)).rejects.toThrow('FACT_COVERAGE_RESTORE_SCOPE');
  expect(query).not.toHaveBeenCalled();expect(target).not.toHaveBeenCalled();
 });
 it('only excludes the explicit operational deletion marker from interpretation hash',()=>{
  const input={timezone:'Asia/Shanghai',privacyMode:'daily_salt',config:{session_timeout:30},goals:[],funnels:[]};
  const baseline=coverageConfigHash(input);
  expect(coverageConfigHash({...input,config:{...input.config,deletion_boundary:'journal applied'}})).toBe(baseline);
  for(const config of [{session_timeout:31},{session_timeout:30,unknown_rule:true}])expect(coverageConfigHash({...input,config})).not.toBe(baseline);
  expect(coverageConfigHash({...input,timezone:'UTC'})).not.toBe(baseline);
  expect(coverageConfigHash({...input,privacyMode:'standard'})).not.toBe(baseline);
  expect(coverageConfigHash({...input,goals:[{id:'goal',config:{event:'signup'}}]})).not.toBe(baseline);
 });
});

 describe('coverage metadata UTC scope',()=>{
 it('restores the original transaction timezone after successful serialization',async()=>{
  const query=vi.fn(async(sql:string)=>({rows:sql.includes('current_setting')?[{timezone:'Asia/Shanghai'}]:[],rowCount:1}));
  const c={query} as unknown as PoolClient;
  expect(await withCoverageMetadataUtc(c,async()=>42)).toBe(42);
  expect(query.mock.calls[1]?.[0]).toContain("'UTC',true");
  expect(query).toHaveBeenLastCalledWith("SELECT set_config('TimeZone',$1,true)",['Asia/Shanghai']);
 });
 it('preserves the original failure when an aborted transaction rejects timezone restoration',async()=>{
  const original=Error('metadata authentication failed');
  const query=vi.fn(async(sql:string)=>{if(sql.includes('$1'))throw Error('25P02');return {rows:[{timezone:'UTC'}],rowCount:1};});
  await expect(withCoverageMetadataUtc({query} as unknown as PoolClient,async()=>{throw original;})).rejects.toBe(original);
  expect(query).toHaveBeenCalledTimes(3);
 });
});

 it('restore reset capabilities cannot be created by callers and null is harmless',async()=>{
 const query=vi.fn();const c={query} as unknown as PoolClient;
 await advanceRestoreRebuildCoverage(c,'site',null);
 await expect(advanceRestoreRebuildCoverage(c,'site',{kind:'fact_coverage_restore_rebuild'})).rejects.toThrow('FACT_COVERAGE_RESTORE_REBUILD_SCOPE');
 expect(query).not.toHaveBeenCalled();
 });

 it('revenue intake refuses forged and cross-scope capability without any mutation',async()=>{
 const query=vi.fn();const c={query} as unknown as PoolClient;
 await advanceRevenueIntakeCoverage(c,'site',null);
 await expect(advanceRevenueIntakeCoverage(c,'site',{kind:'fact_coverage_revenue_intake'})).rejects.toThrow('FACT_COVERAGE_REVENUE_SCOPE');
 expect(query).not.toHaveBeenCalled();
 });

 describe('strict retained source window continuity',()=>{
 const previous=new Date('2026-10-10T12:00:00Z');
 it('rejects backwards cutoff without inferring expired raw from old witness coverage',()=>{
 expect(()=>assertStrictRetainedWindowContinuity({strict:true,authority:'clickhouse',retainedFrom:new Date('2025-10-11T12:00:00Z'),previousRetainedFrom:previous})).toThrow('FACT_RETAINED_WINDOW_EXPANSION_UNPROVEN');
 });
 it('refuses legacy published history with an unknown rebuild boundary even without a witness',()=>{
 expect(()=>assertStrictRetainedWindowContinuity({strict:true,authority:'clickhouse',retainedFrom:previous,previousRetainedFrom:null,hasPublishedBaseline:true})).toThrow('FACT_RETAINED_WINDOW_BASELINE_UNAVAILABLE');
 });
 it('allows equal or forward cutoffs and genuine first bootstrap; leaves PG oracle unchanged',()=>{
 for(const retainedFrom of [previous,new Date('2026-10-10T12:00:01Z')])expect(()=>assertStrictRetainedWindowContinuity({strict:true,authority:'clickhouse',retainedFrom,previousRetainedFrom:previous})).not.toThrow();
 expect(()=>assertStrictRetainedWindowContinuity({strict:true,authority:'clickhouse',retainedFrom:previous,previousRetainedFrom:null})).not.toThrow();
 expect(()=>assertStrictRetainedWindowContinuity({strict:false,authority:'postgres',retainedFrom:new Date('2025-01-01'),previousRetainedFrom:previous})).not.toThrow();
 });
 });

 describe('physical raw retirement frontier',()=>{
 function connection(){
 let row:Record<string,unknown>|null=null;
 const query=vi.fn(async(sql:string,args?:unknown[])=>{
 if(sql.includes("to_regclass"))return {rows:[{present:'analytics_raw_retirement_frontiers'}],rowCount:1};
 if(sql.startsWith('SELECT * FROM analytics_raw_retirement_frontiers'))return {rows:row?[row]:[],rowCount:row?1:0};
 if(sql.includes('s.salt_secret secret'))return {rows:[{epoch:'agg',generation:'2',processed_generation:'1',non_event_generation:'2',authority:'clickhouse',canonical_epoch:'canon',deletion_epoch:'0',secret:'unit-secret',timezone:'UTC',privacy_mode:'standard',config:{}}],rowCount:1};
 if(sql.startsWith('INSERT INTO analytics_raw_retirement_frontiers')){row={site_id:args![0],canonical_epoch:args![1],retired_before:args![2],seal:args![3]};return {rows:[],rowCount:1};}
 return {rows:[],rowCount:0};
 });return {client:{query} as unknown as PoolClient,query,row:()=>row,replace:(next:Record<string,unknown>)=>{row=next;}};
 }
 it('uses actual recorded cutoff without waiting for a shrink producer and never decreases it',async()=>{
 const c=connection();await recordRawRetirementAfterAck(c.client,'site',new Date('2026-10-10T12:00:00Z'));
 await recordRawRetirementAfterAck(c.client,'site',new Date('2026-10-09T12:00:00Z'));
 expect(c.row()?.retired_before).toBe('2026-10-10T12:00:00.000Z');
 await expect(assertRawRetirementWindowContinuity(c.client,'site',new Date('2025-10-11T12:00:00Z'))).rejects.toThrow('FACT_RETAINED_WINDOW_EXPANSION_UNPROVEN');
 await assertRawRetirementWindowContinuity(c.client,'site',new Date('2026-10-10T12:00:01Z'));
 });
 it('rejects frontier tampering rather than accepting a forged earlier retirement boundary',async()=>{
 const c=connection();await recordRawRetirementAfterAck(c.client,'site',new Date('2026-10-10T12:00:00Z'));
 c.replace({...c.row()!,retired_before:'2025-01-01T00:00:00.000Z'});
 await expect(assertRawRetirementWindowContinuity(c.client,'site',new Date('2026-10-11T00:00:00Z'))).rejects.toThrow('FACT_RAW_RETIREMENT_SEAL_INVALID');
 });
 });

 describe('059 origin classification never infers new from absence',()=>{
 function client(record:Record<string,unknown>|null){const query=vi.fn(async(sql:string)=>({rows:sql.includes('to_regclass')?[{present:'analytics_raw_retirement_origins'}]:sql.includes('SELECT * FROM analytics_raw_retirement_origins')?(record?[record]:[]):[],rowCount:0}));return {c:{query} as unknown as PoolClient,query};}
 it('rejects migrated legacy unknown and missing markers even for an empty first publication',async()=>{
 for(const row of [null,{site_id:'site',origin_id:'origin',classification:'legacy_unknown',seal:null}]){const x=client(row);await expect(assertRawRetirementOrigin(x.c,'site',{allowPendingFirstFull:true})).rejects.toThrow('FACT_RAW_RETIREMENT_ORIGIN_UNKNOWN');}
 });
 it('permits a real inserted pending marker only when no published baseline exists',async()=>{
 const x=client({site_id:'site',origin_id:'origin',classification:'new_site_pending',seal:null});await assertRawRetirementOrigin(x.c,'site',{allowPendingFirstFull:true});
 expect(x.query.mock.calls.some(([sql])=>sql.includes("status='published'"))).toBe(true);
 await expect(assertRawRetirementOrigin(x.c,'site')).rejects.toThrow('FACT_RAW_RETIREMENT_ORIGIN_UNKNOWN');
 });
 it('a legacy unknown FULL does not upgrade classification',async()=>{
 const x=client({site_id:'site',origin_id:'origin',classification:'legacy_unknown',seal:null});await initializeNewSiteCoverageOrigin(x.c,'site','run');
 expect(x.query.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
 });
 });
