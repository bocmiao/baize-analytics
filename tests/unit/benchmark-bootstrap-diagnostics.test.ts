import {it,expect} from 'vitest';
import {safeBootstrapDiagnostic,bootstrapStages} from '../../scripts/benchmark/bootstrap-diagnostics.js';
it('emits only fixed stages and explicit known codes, never raw error text or arbitrary code-shaped secrets',()=>{
 expect(safeBootstrapDiagnostic('raw_backup_proof',{code:'42P01',message:'postgres://user:password@private/db'})).toEqual({bootstrapStage:'raw_backup_proof',bootstrapErrorCode:'42P01'});
 for(const error of [Error('private-token /private/path https://private.example'),{code:'SECRET_CUSTOMER_TOKEN'},'private-data',null,{code:'ETIMEDOUT?token=private'},new Proxy({},{get(){throw Error('private getter');}})]){
  const value=safeBootstrapDiagnostic('https://private.example',error);expect(value).toEqual({bootstrapStage:'configuration',bootstrapErrorCode:'BOOTSTRAP_UNKNOWN_FAILURE'});expect(JSON.stringify(value)).not.toContain('private');
 }
});
it('keeps each critical bootstrap step in a finite allowlist and preserves assertion classification',()=>{
 for(const stage of ['module_load','resource_setup','application_start','admin_setup','site_create','seed_collect','seed_drain','shadow','verify','activate','header_migration','fact_migration','cache_migration','header_backup','fact_backup','remaining_backup','cache_backup','strict_activation','raw_prune']){
  expect(bootstrapStages).toContain(stage);expect(safeBootstrapDiagnostic(stage,{code:'BOOTSTRAP_ASSERTION_FAILED'})).toEqual({bootstrapStage:stage,bootstrapErrorCode:'BOOTSTRAP_ASSERTION_FAILED'});
 }
});

it('recognizes only the exact authenticated cache-source failure, without copying nearby message text',()=>{
 expect(safeBootstrapDiagnostic('cache_migration',Error('CACHE_CENTROID_AUTHENTICATED_SOURCE_REQUIRED'))).toEqual({bootstrapStage:'cache_migration',bootstrapErrorCode:'CACHE_CENTROID_AUTHENTICATED_SOURCE_REQUIRED'});
 expect(safeBootstrapDiagnostic('cache_migration',Error('CACHE_CENTROID_AUTHENTICATED_SOURCE_REQUIRED secret=private-token'))).toEqual({bootstrapStage:'cache_migration',bootstrapErrorCode:'BOOTSTRAP_UNKNOWN_FAILURE'});
 expect(safeBootstrapDiagnostic('cache_migration',Object.create(null,{message:{get(){throw Error('private-token');}}}))).toEqual({bootstrapStage:'cache_migration',bootstrapErrorCode:'BOOTSTRAP_UNKNOWN_FAILURE'});
});
