import {expect,it,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {factCoverageMetadataDigest} from '../../src/server/fact-coverage-witness.js';
import {withCoverageSelectedRuns} from '../../src/server/fact-coverage-selected-runs.js';
it('materializes a fresh same-client selection exactly once per closure and always drops it',async()=>{
 const query=vi.fn(async(_sql:string,_args?:unknown[])=>({rows:[],rowCount:0}));const c={query} as unknown as PoolClient;
 const relations:string[]=[];
 for(let i=0;i<2;i++)await withCoverageSelectedRuns(c,'site',async relation=>{relations.push(relation);return 42;});
 expect(relations[0]).not.toBe(relations[1]);
 expect(query.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO'))).toHaveLength(2);
 expect(query.mock.calls.filter(([sql])=>sql.startsWith('DROP TABLE'))).toHaveLength(2);
 expect(query.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO')).every(([,args])=>args?.[0]==='site')).toBe(true);
});
it('preserves original failure when rollback-aborted cleanup also fails',async()=>{
 const original=Error('original authentication failure');
 const query=vi.fn(async(sql:string)=>{if(sql.startsWith('DROP'))throw Error('25P02');return {rows:[],rowCount:0};});
 await expect(withCoverageSelectedRuns({query} as unknown as PoolClient,'site',async()=>{throw original;})).rejects.toBe(original);
 expect(query.mock.calls.at(-1)?.[0]).toContain('DROP TABLE');
});

it('closure preserves the original fetch failure through cursor, TEMP and UTC abort cleanup',async()=>{
 const original=Object.assign(Error('cancelled original fetch'),{code:'57014'});
 const query=vi.fn(async(sql:string)=>{
  if(sql.startsWith('FETCH'))throw original;
  if(sql.startsWith('CLOSE')||sql.startsWith('DROP')||sql.includes("TimeZone',$1"))throw Object.assign(Error('transaction aborted'),{code:'25P02'});
  return {rows:sql.includes("current_setting('TimeZone')")?[{timezone:'UTC'}]:[],rowCount:0};
 });
 await expect(factCoverageMetadataDigest({query} as unknown as PoolClient,'site',{selectedRunReuse:true})).rejects.toBe(original);
 expect(query.mock.calls.some(([sql])=>sql.startsWith('CLOSE'))).toBe(true);
 expect(query.mock.calls.some(([sql])=>sql.startsWith('DROP'))).toBe(true);
});
