import {createHash,createHmac,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {expect,it,vi} from 'vitest';
import {canonical} from '../../src/server/security.js';
import {ClickHouseFactStore,type FactStoreRecord,type FactSourceProvenance} from '../../src/server/fact-store.js';
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
function fixture(nullableSource=false){
 const site=randomUUID(),run=randomUUID(),session=randomUUID(),epoch=randomUUID(),canonicalEpoch=randomUUID(),secret='independent-oracle-secret';
 const uploaded:{row_key:string;body:string;body_hash:string}[]=[];
 const query=vi.fn(async(sql:string,args:unknown[]=[])=>{
  if(sql.startsWith('SELECT r.epoch'))return {rows:[{epoch,status:'staging',salt_secret:secret}],rowCount:1};
  if(sql.startsWith('SELECT * FROM analytics_fact_store_runs')||sql.startsWith('SELECT row_key,body_hash'))return {rows:[],rowCount:0};
  return {rows:[],rowCount:sql.startsWith('INSERT INTO analytics_fact_store_members')?JSON.parse(args[0] as string).length:1};
 });
 const fetcher:typeof fetch=async(url,init)=>{
  if(new URL(String(url)).searchParams.get('query')!.startsWith('INSERT')){uploaded.push(...String(init?.body).split('\n').map(line=>JSON.parse(line)));return new Response('');}
  return new Response(JSON.stringify({data:[...uploaded].sort((a,b)=>a.row_key.localeCompare(b.row_key))}));
 };
 const store=new ClickHouseFactStore({url:'http://localhost:8123',username:'local',password:'unused',fetch:fetcher});
 const fence={expectedAggregationEpoch:epoch,expectedCanonicalEpoch:nullableSource?undefined:canonicalEpoch,expectedDeletionEpoch:nullableSource?undefined:'123',verifyLiveFence:async()=>{}};
 const source:FactSourceProvenance={aggregationEpoch:epoch,canonicalEpoch:nullableSource?null:canonicalEpoch,deletionEpoch:nullableSource?null:'123'};
 const make=(dimensions:Record<string,string|number|boolean|null>):FactStoreRecord=>({row:{run_id:run,event_id:randomUUID(),event_ts:'2026-10-11T01:00:00+01:00',session_id:session,visitor_id:'visitor',event_path:'/路径/😀',dimensions,metric:'pv',key:['é',null,true,1.25],value:1,member:false},visitorId:'visitor',sessionId:session});
 return {site,run,session,store,client:{query} as unknown as PoolClient,fence,source,secret,uploaded,make};
}
function legacyOracle(f:ReturnType<typeof fixture>,raw:FactStoreRecord){
 // Legacy Zod normalization removes __proto__; the optimization must not change this boundary.
 const dimensions=Object.fromEntries(Object.entries(raw.row.dimensions).filter(([key])=>key!=='__proto__'));
 const row={...raw.row,run_id:raw.row.run_id.toLowerCase(),event_id:raw.row.event_id.toLowerCase(),event_ts:new Date(raw.row.event_ts).toISOString(),dimensions};
 const normalized={row,visitorId:raw.visitorId,sessionId:raw.sessionId.toLowerCase()};
 const bodySeal=createHmac('sha256',f.secret).update(canonical(['derived-fact-store-v1',f.site,'effects',normalized,f.source])).digest('hex');
 const body=canonical({...normalized,kind:'effects',source:f.source,bodySeal});
 const effect=raw.row as Extract<FactStoreRecord['row'],{session_id:string}>;
 return {body,body_hash:sha(body),row_key:sha(canonical([row.run_id,row.event_id,effect.session_id.toLowerCase(),row.metric,effect.key,effect.member]))};
}
it('emits exact legacy canonical/HMAC/SHA/key bytes for independent Unicode, primitive and own-key rows',async()=>{
 const f=fixture(),special=JSON.parse('{"__proto__":"literal","constructor":null,"toString":true,"prototype":7,"unicode":"😀/é\\n","negative":-0.125}') as Record<string,string|number|boolean|null>;
 const records=[f.make(special),f.make({unicode:'另一行',nullable:null,enabled:false,numeric:0})],before=JSON.stringify(records);
 await f.store.stageRecords(f.client,f.site,f.run,'effects',records,f.fence);
 expect(f.uploaded.map(({body,body_hash,row_key})=>({body,body_hash,row_key}))).toEqual(records.map(r=>legacyOracle(f,r)).sort((a,b)=>a.row_key.localeCompare(b.row_key)));
 expect(JSON.stringify(records)).toBe(before);expect(Object.hasOwn(special,'__proto__')).toBe(true);expect(Object.getPrototypeOf(special)).toBe(Object.prototype);
});
it('preserves the exact 32 KiB normalized boundary and rejects one extra byte before transport',async()=>{
 const f=fixture(),record=f.make({padding:''});
 const normalized={...record,row:{...record.row,event_ts:new Date(record.row.event_ts).toISOString()}};
 const padding=32768-Buffer.byteLength(canonical(normalized));record.row.dimensions.padding='x'.repeat(padding);
 expect(Buffer.byteLength(canonical({...record,row:{...record.row,event_ts:new Date(record.row.event_ts).toISOString()}}))).toBe(32768);
 await f.store.stageRecords(f.client,f.site,f.run,'effects',[record],f.fence);expect(f.uploaded[0]).toMatchObject(legacyOracle(f,record));
 const oversized=f.make({padding:'x'.repeat(padding+1)});await expect(f.store.stageRecords(f.client,f.site,f.run,'effects',[oversized],f.fence)).rejects.toThrow('FACT_STORE_BODY_LIMIT');expect(f.uploaded).toHaveLength(1);
});

it('preserves nullable canonical provenance bytes without caching source objects',async()=>{const f=fixture(true),r=f.make({channel:null});await f.store.stageRecords(f.client,f.site,f.run,'effects',[r],f.fence);expect(f.uploaded[0]).toMatchObject(legacyOracle(f,r));expect(JSON.parse(f.uploaded[0].body).source).toEqual(f.source);});
