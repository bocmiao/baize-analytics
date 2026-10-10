import {describe,it,expect,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {verifyCanonicalRetryReceipt,type CanonicalIngestTarget} from '../../src/server/canonical-ingest.js';
describe('canonical retry chain fails closed',()=>{
 it('rejects a loop without reading any orphan body',async()=>{
  const query=vi.fn(async(sql:string,args:unknown[])=>sql.includes('canonical_event_members')?{rowCount:0,rows:[]}:{rowCount:1,rows:[{replacement_event_id:args[1]==='a'?'b':'a'}]});
  const readPublishedEvent=vi.fn();const target={epoch:'epoch',store:{readPublishedEvent}} as unknown as CanonicalIngestTarget;
  await expect(verifyCanonicalRetryReceipt({query} as unknown as PoolClient,'site',target,'a')).rejects.toMatchObject({code:'canonical_unavailable'});expect(query).toHaveBeenCalledTimes(4);expect(readPublishedEvent).not.toHaveBeenCalled();
 });
 it('caps a chain at 64 links instead of following unbounded metadata',async()=>{
  let n=0;const query=vi.fn(async(sql:string)=>sql.includes('canonical_event_members')?{rowCount:0,rows:[]}:{rowCount:1,rows:[{replacement_event_id:String(++n)}]});
  const target={epoch:'epoch',store:{readPublishedEvent:vi.fn()}} as unknown as CanonicalIngestTarget;
  await expect(verifyCanonicalRetryReceipt({query} as unknown as PoolClient,'site',target,'0')).rejects.toMatchObject({code:'canonical_unavailable'});expect(query).toHaveBeenCalledTimes(128);
 });
});
