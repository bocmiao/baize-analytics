import {describe,it,expect,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {lookupSessionPagePath,lookupSessionPagePaths,type SessionPagePathInput} from '../../src/server/session-page-paths.js';
import {withPerformanceObservation,type PerformanceObservation} from '../../src/server/performance-observation.js';
const table='fact_ordered_0123456789abcdef0123456789abcdef';
const row:SessionPagePathInput={visitor_id:'constructor',component:'9007199254740993',page_id:'00000000-0000-4000-8000-000000000001',ts:new Date('2026-10-11T00:00:00Z'),event_id:'00000000-0000-4000-8000-000000000002'};
const client=(query:ReturnType<typeof vi.fn>)=>({query}) as unknown as Pick<PoolClient,'query'>;
describe('bounded session page path lookup',()=>{
 it('preserves duplicate inputs, bigint component and exact input order with a single bounded query',async()=>{
  const input=Array.from({length:100},()=>row),query=vi.fn().mockResolvedValue({rows:input.map((_,ordinal)=>({ordinal,path:ordinal%2===0?'/路径/🧭':null}))});
  const paths=await lookupSessionPagePaths(client(query),table,input);expect(paths).toEqual(input.map((_,i)=>i%2===0?'/路径/🧭':undefined));expect(query).toHaveBeenCalledTimes(1);
  const sent=JSON.parse(query.mock.calls[0][1][0]);expect(sent).toHaveLength(100);expect(sent[99]).toEqual({...row,ordinal:99,ts:new Date(row.ts).toISOString()});expect(input[0]).toBe(row);
 });
 it('rejects 101 and unsafe relation before SQL, while zero input issues no query',async()=>{
  const query=vi.fn();expect(await lookupSessionPagePaths(client(query),table,[])).toEqual([]);await expect(lookupSessionPagePaths(client(query),table,Array(101).fill(row))).rejects.toThrow('SESSION_PAGE_PATH_BATCH_LIMIT');await expect(lookupSessionPagePaths(client(query),table+';DROP',[])).rejects.toThrow('SESSION_PAGE_PATH_RELATION_INVALID');expect(query).not.toHaveBeenCalled();
 });
 it('fails closed for missing, duplicated, reordered, extra or invalid returned paths',async()=>{
  for(const rows of [[],[{ordinal:0,path:'/'},{ordinal:0,path:'/'}],[{ordinal:1,path:'/'},{ordinal:0,path:'/'}],[{ordinal:0,path:3},{ordinal:1,path:'/'}],[{ordinal:0,path:'/'},{ordinal:1,path:'/'},{ordinal:2,path:'/'}]])await expect(lookupSessionPagePaths(client(vi.fn().mockResolvedValue({rows})),table,[row,row])).rejects.toThrow('SESSION_PAGE_PATH_RESULT_INVALID');
 });
 it('keeps scalar NULL/missing fallback and underlying SQL rejection unchanged',async()=>{
  for(const rows of [[],[{path:null}]])expect(await lookupSessionPagePath(client(vi.fn().mockResolvedValue({rows})),table,row)).toBeUndefined();
  const original=Object.assign(Error('query cancelled'),{code:'57014'});await expect(lookupSessionPagePaths(client(vi.fn().mockRejectedValue(original)),table,[row])).rejects.toBe(original);
 });
 it('records failed SQL without replacing the original error or claiming returned rows',async()=>{
  const seen:PerformanceObservation[]=[],original=Object.assign(Error('cancelled'),{code:'57014'});
  await expect(withPerformanceObservation('background_worker',o=>{seen.push(o);},()=>lookupSessionPagePaths(client(vi.fn().mockRejectedValue(original)),table,[row]))).rejects.toBe(original);
  expect(seen).toHaveLength(1);expect(seen[0]).toMatchObject({stage:'page_path_lookup',result:'failure',lookupInputRows:1,rows:0});expect(seen[0].lookupReturnedRows).toBeUndefined();
 });
 it('records one real query leaf with input and returned counts, without identity or SQL in observations',async()=>{
  const seen:PerformanceObservation[]=[];
  const result=await withPerformanceObservation('background_worker',o=>{seen.push(o);throw Error('observer');},()=>lookupSessionPagePaths(client(vi.fn().mockResolvedValue({rows:[{ordinal:0,path:null},{ordinal:1,path:'/'}]})),table,[row,row]));
  expect(result).toEqual([undefined,'/']);expect(seen).toHaveLength(1);expect(seen[0]).toMatchObject({stage:'page_path_lookup',result:'success',lookupInputRows:2,lookupReturnedRows:2,batches:1});expect(JSON.stringify(seen)).not.toContain(row.visitor_id);expect(JSON.stringify(seen)).not.toContain(table);
 });
});
