import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {describe,it,expect,vi} from 'vitest';
import {settleFactPublicationUploads} from '../../src/server/fact-publication-pipeline.js';
import {ClickHouseFactStore,type FactStoreRecord} from '../../src/server/fact-store.js';
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
function deferred<T>(){let resolve!:(v:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
describe('bounded publication task settlement',()=>{
 it('starts only two and waits for the unfinished sibling before rethrowing the first original error',async()=>{const gate=deferred<void>(),first=Error('first'),events:string[]=[];let settled=false;const pending=settleFactPublicationUploads([async()=>{events.push('one');throw first;},async()=>{events.push('two');await gate.promise;events.push('two end');}]);const rejection=expect(pending).rejects.toBe(first);pending.catch(()=>{settled=true;});await tick();expect(events).toEqual(['one','two']);expect(settled).toBe(false);gate.resolve();await rejection;expect(events).toEqual(['one','two','two end']);});
 it('keeps chronological first error even when a later sibling rejects and handles synchronous task failure',async()=>{const gate=deferred<void>(),early=Error('early'),late=Error('late');const pending=settleFactPublicationUploads([()=>gate.promise,()=>{throw early;}]);const rejection=expect(pending).rejects.toBe(early);await tick();gate.reject(late);await rejection;});
 it('accepts zero and rejects three before starting any task',async()=>{await settleFactPublicationUploads([]);const task=vi.fn();await expect(settleFactPublicationUploads([task,task,task])).rejects.toThrow('FACT_STORE_PUBLICATION_PIPELINE_LIMIT');expect(task).not.toHaveBeenCalled();});
});
function fixture(options:{secondInsertFails?:boolean;secondMemberFails?:boolean}={}){
 const site=randomUUID(),run=randomUUID(),epoch=randomUUID(),session=randomUUID(),received:{attempt_id:string;row_key:string;body:string;body_hash:string}[][]=[],readbacks:ReturnType<typeof deferred<Response>>[]=[],receipts:string[]=[];
 const pgFailure=Object.assign(Error('member FK failure'),{code:'23503'});let memberCalls=0;
 const query=vi.fn(async(sql:string,args:unknown[]=[])=>{
  if(sql.startsWith('SELECT r.epoch'))return {rows:[{epoch,status:'staging',salt_secret:'private'}],rowCount:1};
  if(sql.startsWith('SELECT * FROM analytics_fact_store_runs')||sql.startsWith('SELECT row_key,body_hash'))return {rows:[],rowCount:0};
  if(sql.startsWith('INSERT INTO analytics_fact_store_batches')){receipts.push(args[4] as string);return {rows:[],rowCount:1};}
  if(sql.startsWith('INSERT INTO analytics_fact_store_members')){memberCalls++;if(options.secondMemberFails&&memberCalls===2)throw pgFailure;return {rows:[],rowCount:JSON.parse(args[0] as string).length};}
  return {rows:[],rowCount:1};
 });
 const fetcher:typeof fetch=async(url,init)=>{
  const u=new URL(String(url)),sql=u.searchParams.get('query')!;
  if(sql.startsWith('INSERT')){received.push(String(init?.body).split('\n').map(line=>JSON.parse(line)));if(options.secondInsertFails&&received.length===2)return new Response('failed',{status:503});return new Response('');}
  const gate=deferred<Response>();readbacks.push(gate);return gate.promise;
 };
 const store=new ClickHouseFactStore({url:'http://localhost:8123',username:'local',password:'not-observed',fetch:fetcher}),client={query} as unknown as PoolClient;
 const records=Array.from({length:2},():FactStoreRecord=>({row:{run_id:run,event_id:randomUUID(),event_ts:'2026-10-11T00:00:00Z',session_id:session,visitor_id:'visitor',event_path:'/路径',dimensions:{channel:'direct'},metric:'pv',key:[],value:1,member:false},visitorId:'visitor',sessionId:session}));
 const fence={expectedAggregationEpoch:epoch,verifyLiveFence:vi.fn(async()=>{})};
 const finish=(index:number)=>readbacks[index].resolve(new Response(JSON.stringify({data:received[index].map(row=>({row_key:row.row_key,body:row.body,body_hash:row.body_hash})).sort((a,b)=>a.row_key.localeCompare(b.row_key))})));
 return {store,client,site,run,records,fence,received,readbacks,receipts,finish,query,pgFailure};
}
describe('adapter publication separates network and ordered PG receipt work',()=>{
 it('starts two independent uploads but writes no receipt until both full readbacks pass; commits in original page order',async()=>{const f=fixture(),pending=f.store.stageBatches(f.client,f.site,f.run,'effects',f.records.map(r=>[r]),f.fence,{concurrency:2});await tick();expect(f.received).toHaveLength(2);expect(f.readbacks).toHaveLength(2);expect(f.receipts).toEqual([]);f.finish(1);await tick();expect(f.receipts).toEqual([]);f.finish(0);expect((await pending).map(r=>r.staged)).toEqual([1,1]);expect(f.receipts).toEqual(f.received.map(rows=>rows[0].attempt_id));expect(f.fence.verifyLiveFence).toHaveBeenCalledTimes(4);});
 it('waits for successful sibling EOF/readback after second upload fails and never writes manifests',async()=>{const f=fixture({secondInsertFails:true});let rejected=false;const pending=f.store.stageBatches(f.client,f.site,f.run,'effects',f.records.map(r=>[r]),f.fence,{concurrency:2});const rejection=expect(pending).rejects.toThrow('FACT_STORE_CH_UNAVAILABLE');pending.catch(()=>{rejected=true;});await tick();expect(f.received).toHaveLength(2);expect(rejected).toBe(false);f.finish(0);await rejection;expect(f.receipts).toEqual([]);});
 it('finishes all network work before an ordered PG member failure and preserves that native error',async()=>{const f=fixture({secondMemberFails:true}),pending=f.store.stageBatches(f.client,f.site,f.run,'effects',f.records.map(r=>[r]),f.fence,{concurrency:2});const rejection=expect(pending).rejects.toBe(f.pgFailure);await tick();f.finish(1);f.finish(0);await rejection;expect(f.receipts).toEqual(f.received.map(rows=>rows[0].attempt_id));});
 it('rejects cross-page fresh PK collisions and oversized groups before network dispatch',async()=>{const f=fixture();await expect(f.store.stageBatches(f.client,f.site,f.run,'effects',[[f.records[0]],[f.records[0]]],f.fence,{concurrency:2})).rejects.toThrow('FACT_STORE_KEY_CONFLICT');expect(f.received).toEqual([]);await expect(f.store.stageBatches(f.client,f.site,f.run,'effects',[[],[],[]],f.fence,{concurrency:2})).rejects.toThrow('FACT_STORE_PUBLICATION_PIPELINE_LIMIT');await expect(f.store.stageBatches(f.client,f.site,f.run,'effects',[Array(101).fill(f.records[0])],f.fence,{concurrency:2})).rejects.toThrow('FACT_STORE_PUBLICATION_PIPELINE_LIMIT');expect(f.received).toEqual([]);});
 it('default width retains single upload/readback/receipt completion before starting next page',async()=>{const f=fixture(),pending=f.store.stageBatches(f.client,f.site,f.run,'effects',f.records.map(r=>[r]),f.fence);await tick();expect(f.received).toHaveLength(1);f.finish(0);await tick();expect(f.received).toHaveLength(2);expect(f.receipts).toHaveLength(1);f.finish(1);expect((await pending).map(r=>r.staged)).toEqual([1,1]);});
});

describe('publication cursor integration keeps each page bounded',()=>{
 it('passes two 100-row pages then a singleton tail, completes effects before zero vitals, and never uses stageRecords in width two',async()=>{
  vi.stubEnv('BAIZE_FACT_PUBLICATION_CONCURRENCY','2');
  try{
   const {publishRunFactBodies}=await import('../../src/server/fact-store-publication.js'),f=fixture(),row=f.records[0].row,events:string[]=[];
   const effects=[Array(100).fill(row),Array(100).fill(row),[row],[]];
   const query=vi.fn(async(sql:string)=>({rows:sql.startsWith('FETCH')&&sql.includes('fact_publish_')?(effects.shift()??[]):[],rowCount:0}));
   const stageRecords=vi.fn(),stageBatches=vi.fn(async(_c,_s,_r,kind,batches)=>{events.push(kind+':'+batches.map((r:unknown[])=>r.length).join(','));}),completeRunKind=vi.fn(async(_c,_s,_r,kind)=>{events.push(kind+':complete');});
   await publishRunFactBodies({query} as unknown as PoolClient,{stageRecords,stageBatches,completeRunKind},f.site,f.run,f.fence);
   expect(events).toEqual(['effects:100,100','effects:1','effects:complete','vitals:complete']);expect(stageRecords).not.toHaveBeenCalled();expect(stageBatches).toHaveBeenCalledTimes(2);
  }finally{vi.unstubAllEnvs();}
 });
 it('preserves original stage failure even if transaction-aborted cursor cleanup rejects',async()=>{
  vi.stubEnv('BAIZE_FACT_PUBLICATION_CONCURRENCY','2');
  try{
   const {publishRunFactBodies}=await import('../../src/server/fact-store-publication.js'),f=fixture(),original=Object.assign(Error('original FK'),{code:'23503'});let fetches=0;
   const query=vi.fn(async(sql:string)=>{if(sql.startsWith('CLOSE'))throw Object.assign(Error('aborted'),{code:'25P02'});return {rows:sql.startsWith('FETCH')&&fetches++===0?[f.records[0].row]:[],rowCount:0};});
   const completeRunKind=vi.fn(),stageRecords=vi.fn(),stageBatches=vi.fn(async()=>{throw original;});
   await expect(publishRunFactBodies({query} as unknown as PoolClient,{stageRecords,stageBatches,completeRunKind},f.site,f.run,f.fence)).rejects.toBe(original);expect(completeRunKind).not.toHaveBeenCalled();expect(query.mock.calls.some(([sql])=>sql.startsWith('CLOSE'))).toBe(true);
  }finally{vi.unstubAllEnvs();}
 });
});
