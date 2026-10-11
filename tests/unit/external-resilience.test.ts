import {describe,it,expect} from 'vitest';
import {gscRows,gaRows} from '../../src/server/external-worker.js';
import type {Transport} from '../../src/server/outbound.js';
const methods=[gscRows,gaRows] as const;
describe('Google aggregate transport failure boundaries (simulated providers)',()=>{
 for(const method of methods){
  const name=method===gscRows?'GSC':'GA legacy adapter';
  it(`${name} rejects malformed responses without disclosing body or credential`,async()=>{
   for(const text of ['secret-provider-token','null','[]','{"rows":null}','{"rows":{}}','{"rows":"private-error"}','{"rows":[null]}']){
    const transport:Transport=async()=>({status:200,headers:{},text});
    try{await method('secret-provider-token','123','2026-10-01','2026-10-02',transport);throw new Error('accepted invalid response');}catch(error){expect(error).toMatchObject({code:'external_response_invalid',statusCode:502});expect(String(error)).not.toContain('secret-provider-token');expect(String(error)).not.toContain('private-error');}
   }
  });
  it(`${name} has no implicit retries after 429 or timeout`,async()=>{
   let calls=0;const transport:Transport=async()=>{calls++;return {status:429,headers:{'retry-after':'3600'},text:'private quota detail'};};
   await expect(method('token','123','2026-10-01','2026-10-02',transport)).rejects.toMatchObject({code:'external_provider_failed'});expect(calls).toBe(1);
   const failure=new Error('timeout');const timeout:Transport=async()=>{throw failure;};await expect(method('token','123','2026-10-01','2026-10-02',timeout)).rejects.toBe(failure);
  });
  it(`${name} discards an earlier full page when the next page is malformed`,async()=>{
   let calls=0;const limit=method===gscRows?25000:10000;const transport:Transport=async()=>({status:200,headers:{},text:++calls===1?JSON.stringify({rows:Array.from({length:limit},()=>({}))}):'{private-invalid'});
   await expect(method('token','123','2026-10-01','2026-10-02',transport)).rejects.toMatchObject({code:'external_response_invalid'});expect(calls).toBe(2);
  });
  it(`${name} accepts a valid empty report and rejects over-limit pages`,async()=>{
   const empty:Transport=async()=>({status:200,headers:{},text:'{}'});expect(await method('token','123','2026-10-01','2026-10-02',empty)).toEqual([]);
   const limit=method===gscRows?25000:10000;const excess:Transport=async()=>({status:200,headers:{},text:JSON.stringify({rows:Array.from({length:limit+1},()=>({}))})});await expect(method('token','123','2026-10-01','2026-10-02',excess)).rejects.toMatchObject({code:'external_response_invalid'});
  });
 }
});
