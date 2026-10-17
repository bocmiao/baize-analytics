import {describe,it,expect} from 'vitest';
import {minuteBuckets,realtimeTimestamp} from '../../src/web/realtimeTime';
describe('realtime HTTP/SSE timestamps',()=>{
 it('accepts actual PostgreSQL JSON, ClickHouse UTC and numeric PHP/SSE shapes',()=>{
  const epoch=Date.parse('2026-10-17T03:12:14.125Z');
  for(const value of [epoch,String(epoch),'2026-10-17T03:12:14.125Z','2026-10-17 03:12:14.125','2026-10-17T11:12:14.125+08:00',new Date(epoch)])expect(realtimeTimestamp(value)).toBe(epoch);
 });
 it('does not turn absent or invalid timestamps into epoch visits',()=>{
  for(const value of [null,undefined,'',false,{},NaN,Infinity,-1,1e20,'unavailable','2026-10-17T03:12:14'])expect(realtimeTimestamp(value)).toBeNull();
 });
 it('groups only observed preview events in thirty civil minutes without inventing totals',()=>{
  const buckets=minuteBuckets([{ts:'2026-10-17T03:12:14.125Z'},{ts:'2026-10-17 03:12:59.999'},{ts:'2026-10-17T03:11:59Z'},{ts:'2026-10-17T02:42:59Z'},{ts:null}]);
  expect(buckets).toHaveLength(30);expect(buckets[29]?.count).toBe(2);expect(buckets[28]?.count).toBe(1);expect(buckets.reduce((sum,bucket)=>sum+bucket.count,0)).toBe(3);expect(minuteBuckets([{ts:null}])).toEqual([]);
 });
});
