import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import type {PoolClient} from 'pg';
import {it,expect,vi} from 'vitest';
import type {HistoryStore} from '../../src/server/history-store.js';
vi.mock('../../src/server/fact-coverage-witness.js',()=>({verifyStoredFactCoverageWitness:vi.fn(async()=>null),verifyStoredRawRetirementFrontier:vi.fn(async()=>null)}));
vi.mock('../../src/server/deletion.js',()=>({readVerifiedDeletionRecords:async()=>[]}));
vi.mock('../../src/server/history-carry-backup.js',()=>({hasCarrySchema:async()=>false,carryTables:[],verifyCarryCheckpoint:()=>{},carryCheckpointFromRow:()=>{}}));
import {backupHistoryNamespaces,restoreHistoryNamespaces} from '../../src/server/history-namespace-backup.js';
function fixture(unknown=false){
 const cursors=new Map<string,unknown[]>();let visitor='B';const queries:string[]=[];
 const client={query:async(sql:string)=>{queries.push(sql);
  if(sql.includes('FROM schema_migrations'))return {rows:unknown?[{version:'057_unknown.sql'}]:[]};
  if(sql.includes('to_regclass'))return {rows:[{present:sql.includes('analytics_raw_retirement_frontiers')?'analytics_raw_retirement_frontiers':sql.includes('analytics_fact_coverage_witnesses')?'analytics_fact_coverage_witnesses':sql.includes('analytics_incremental_run_plans')?'analytics_incremental_run_plans':null}]};
  if(sql==='SELECT id FROM sites ORDER BY id LIMIT 5001')return {rows:[{id:'site'}]};
  const declared=sql.match(/^DECLARE (\w+) NO SCROLL CURSOR FOR (.*)$/);if(declared){const name=declared[1]!,body=declared[2]!;let rows:unknown[]=[];if(body.includes('FROM analytics_raw_retirement_frontiers'))rows=[{data:{site_id:'site',canonical_epoch:'source-epoch',retired_before:'2026-10-10T00:00:00.000Z',seal:'original-frontier-hmac'}}];else if(body.includes('FROM analytics_fact_coverage_witnesses'))rows=[{data:{site_id:'site',state:'invalid',seal:'original-hmac'}}];else if(body.includes('FROM analytics_incremental_run_plans'))rows=[{data:{run_id:'run',parent_run_id:'parent',mode:'visitor_delta',non_event_generation:1}}];else if(body.includes('FROM analytics_incremental_run_visitors'))rows=[{data:{run_id:'run',visitor_id:visitor}}];else if(body.includes('FROM aggregation_state'))rows=[{data:{site_id:'site',non_event_generation:1}}];cursors.set(name,rows);return {rows:[]};}
  const fetched=sql.match(/^FETCH (?:FORWARD )?100 FROM (\w+)$/);if(fetched){const rows=cursors.get(fetched[1]!)??[];cursors.set(fetched[1]!,[]);return {rows};}
  return {rows:[]};
 }} as unknown as PoolClient;
 return {client,queries,changeVisitor:()=>{visitor='A';}};
}
it('signs published 056 plans, visitors and non-event watermark; changed restored metadata refuses before CH writes',async()=>{
 const dir=await mkdtemp('/tmp/baize-056-scope-unit-');try{await writeFile(join(dir,'tombstones.jsonl'),'');const f=fixture(),target={initialize:vi.fn()} as unknown as HistoryStore,key=Buffer.alloc(32,7),packageDir=join(dir,'package');
 await backupHistoryNamespaces(f.client,target,packageDir,'source',dir,{key});const manifest=JSON.parse(await readFile(join(packageDir,'manifest.json'),'utf8'));expect(manifest.schemaScope).toContain('+056-incremental-publication-v1+057-coverage-witness-v1');expect(manifest.schemaScope).toContain('+058-raw-retirement-frontier-v1');expect(manifest.mac).toMatch(/^[a-f0-9]{64}$/);const rows=(await readFile(join(packageDir,'facts.ndjson'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));expect(rows.map(row=>row.table)).toEqual(['analytics_raw_retirement_frontiers','analytics_fact_coverage_witnesses','aggregation_state','analytics_incremental_run_plans','analytics_incremental_run_visitors']);expect(f.queries.filter(sql=>sql.startsWith('DECLARE')&&sql.includes('analytics_incremental_run_')).every(sql=>sql.includes("r.status='published'"))).toBe(true);
 f.changeVisitor();await expect(restoreHistoryNamespaces(f.client,target,packageDir,'target',dir,{key})).rejects.toThrow('HISTORY_NAMESPACE_FACT_BACKING_MISMATCH');expect(target.initialize).not.toHaveBeenCalled();
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('keeps unknown future migrations fail-closed before any package or CH writes',async()=>{
 const dir=await mkdtemp('/tmp/baize-056-future-unit-');try{const target={initialize:vi.fn()} as unknown as HistoryStore;await expect(backupHistoryNamespaces(fixture(true).client,target,join(dir,'package'),'source',dir,{key:Buffer.alloc(32)})).rejects.toThrow('HISTORY_BACKUP_UNSUPPORTED_FUTURE_SCHEMA');expect(target.initialize).not.toHaveBeenCalled();}finally{await rm(dir,{recursive:true,force:true});}
});
