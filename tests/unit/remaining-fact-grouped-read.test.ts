import {createHash,createHmac,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {expect,it,vi} from 'vitest';
import {ClickHouseRemainingFactStore} from '../../src/server/remaining-fact-store.js';
import {canonical} from '../../src/server/security.js';
import {remainingRecordKey,normalizeRemainingRecord} from '../../src/server/remaining-fact-record.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function fixture(width:1|3,mutate?:(rows:Record<string,string>[])=>Record<string,string>[]){
 const site=randomUUID(),run=randomUUID(),epoch=randomUUID(),secret='unit-independent-seal',from='2026-10-11T00:00:00.000Z',to=from;
 const items=Array.from({length:3},(_,i)=>{const session=randomUUID(),record=normalizeRemainingRecord('numerics',{row:{run_id:run,session_id:session,bucket_kind:'hourly',bucket:from,metric:'pv',key:['路径😀/'+i,null,true],value:i+1},visitorId:'v'+i,sessionId:session,from,to}),source={aggregationEpoch:epoch,canonicalEpoch:null,deletionEpoch:null};const bodySeal=createHmac('sha256',secret).update(canonical(['remaining-fact-store-v1',site,'numerics',record,source])).digest('hex'),body=canonical({...record,kind:'numerics',source,bodySeal}),row_key=remainingRecordKey('numerics',record),body_hash=hash(body),attempt_id=randomUUID(),id=randomUUID();const member={run_id:run,kind:'numerics',row_key,body_hash,visitor_id:record.visitorId,session_id:session,interval_from:from,interval_to:to};return {record,body,row_key,body_hash,attempt_id,member,batch:{id,attempt_id,kind:'numerics',aggregation_epoch:epoch,source_aggregation_epoch:epoch,canonical_epoch:null,deletion_epoch:null,row_count:1,checksum:hash(row_key+':'+body_hash)}};});
 let offset=0;const query=vi.fn(async(sql:string,args:unknown[]=[])=>{
  if(sql.startsWith('SELECT r.epoch'))return {rows:[{epoch,current_epoch:epoch,status:'published',salt_secret:secret}]};
  if(sql.startsWith('SELECT * FROM analytics_remaining_fact_runs'))return {rows:[{state:'complete',aggregation_epoch:epoch}]};
  if(sql.startsWith('FETCH')){const result=items.slice(offset,offset+width).map(i=>i.batch);offset+=width;return {rows:result};}
  if(sql.startsWith('SELECT * FROM analytics_remaining_fact_members'))return {rows:[items.find(i=>i.batch.id===args[0])!.member]};
  return {rows:[]};
 });
 let requests=0;const store=new ClickHouseRemainingFactStore({url:'http://localhost:8123',username:'local',password:'unused',readReceiptBatchSize:width,fetch:async url=>{requests++;const u=new URL(String(url)),grouped=u.searchParams.get('query')!.includes('base64Encode');let rows:Record<string,string>[];if(grouped){rows=items.map(i=>({attempt_id:i.attempt_id,row_key:i.row_key,body_hash:i.body_hash,body_base64:Buffer.from(i.body).toString('base64')}));if(mutate)rows=mutate(rows);}else{const item=items.find(i=>i.attempt_id===u.searchParams.get('param_attempt'))!;rows=[{row_key:item.row_key,body_hash:item.body_hash,body:item.body}];}return new Response(JSON.stringify({data:rows}));}});
 return {store,site,run,items,query,client:{query} as unknown as PoolClient,requests:()=>requests};
}
it('authenticates all three receipts in original order with one request; default-equivalent scalar needs three',async()=>{for(const width of [1,3] as const){const f=fixture(width),result=[];for await(const batch of f.store.streamRunRows(f.client,f.site,f.run,'numerics')){expect(batch.length).toBeLessThanOrEqual(100);result.push(...batch);}expect(result.map(r=>r.row)).toEqual(f.items.map(i=>i.record.row));expect(f.requests()).toBe(width===1?3:1);expect(f.query.mock.calls.filter(([sql])=>sql.startsWith('SELECT * FROM analytics_remaining_fact_members'))).toHaveLength(3);}});
it.each(['missing','unknown','duplicate','base64','utf8','overbound','sentinel','hash'] as const)('rejects %s in the third receipt without yielding earlier valid batches',async fault=>{
 const f=fixture(3,rows=>{const last=rows[2]!;if(fault==='missing')return rows.slice(0,2);if(fault==='unknown')last.attempt_id=randomUUID();if(fault==='duplicate')return [...rows,last];if(fault==='base64')last.body_base64='!!!!';if(fault==='utf8')last.body_base64=Buffer.from([255]).toString('base64');if(fault==='overbound')last.body_base64='A'.repeat(44052);if(fault==='sentinel')return [...rows,...Array.from({length:100},(_,i)=>({...last,row_key:hash('sentinel'+i)}))];if(fault==='hash')last.body_hash='0'.repeat(64);return rows;});
 const iterator=f.store.streamRunRows(f.client,f.site,f.run,'numerics');await expect(iterator.next()).rejects.toThrow(/REMAINING_FACT_(BODY_UNAVAILABLE|READ_LIMIT)/);expect(f.requests()).toBe(1);expect(f.query.mock.calls.at(-1)?.[0]).toMatch(/^CLOSE /);
});
it('rejects an unsupported scheduling width at construction',()=>{expect(()=>new ClickHouseRemainingFactStore({url:'http://localhost',username:'x',password:'x',readReceiptBatchSize:2 as 1})).toThrow('REMAINING_FACT_READ_LIMIT');});
