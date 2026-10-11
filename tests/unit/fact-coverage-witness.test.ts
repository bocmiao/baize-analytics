import {describe,it,expect,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {advanceFactCoverageWitness,captureFactCoverageWitness,coverageConfigHash,restoreFactCoverageWitness,withCoverageMetadataUtc,advanceRestoreRebuildCoverage,advanceRevenueIntakeCoverage} from '../../src/server/fact-coverage-witness.js';

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
