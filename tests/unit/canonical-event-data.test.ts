import {describe,it,expect} from 'vitest';
import {canonicalEventData,EXPORT_ROW_LIMIT} from '../../src/server/site-export.js';
import type {StoredEvent} from '../../src/server/clickhouse-store.js';
const event=(props:unknown,site_id='site'):StoredEvent=>({site_id,event_id:'event',ts:new Date('2026-01-01'),visitor_id:'visitor',page_id:'page',type:'event',path:'/',payload:{props},dimensions:{},is_bot:false} as StoredEvent);
describe('canonical export EAV',()=>{
 it('preserves primitive types and numeric PG decimal representation',()=>{
  const rows=canonicalEventData([event({flag:true,text:'true',decimal:1e-7,large:1e21,zero:0})],'site');
  expect(rows.map(r=>[r.data_key,r.data_type,r.string_value,r.number_value,r.boolean_value])).toEqual([['flag','b',null,null,true],['text','s','true',null,null],['decimal','n',null,'0.0000001',null],['large','n',null,'1000000000000000000000',null],['zero','n',null,'0',null]]);
 });
 it('rejects foreign-site bodies and malformed properties rather than claiming empty success',()=>{
  expect(()=>canonicalEventData([event({},'foreign')],'site')).toThrow();
  for(const props of [null,[],{bad:null},{bad:NaN},{bad:{nested:true}}])expect(()=>canonicalEventData([event(props)],'site')).toThrow();
 });
 it('fails at the per-table limit without silently truncating',()=>{
  const events=Array.from({length:EXPORT_ROW_LIMIT+1},()=>event({ok:true}));
  expect(()=>canonicalEventData(events,'site')).toThrow('Export table exceeds 100000 rows');
 });
});
