import {describe,it,expect} from 'vitest';
import {incrementalSessionConfigHash,type IncrementalSessionIdentity} from '../../src/server/incremental-session-plan.js';
const identity:IncrementalSessionIdentity={siteId:'s',epoch:'e',generation:'1',high:'2',strict:true,timezone:'Asia/Shanghai',privacy:false,retentionDays:30,config:{session_timeout_minutes:30,nested:{b:2,a:1}},goals:[],funnels:[],retainedFrom:new Date('2026-10-01T00:00:00Z')};
describe('incremental session configuration evidence',()=>{
 it('canonicalizes object keys and excludes capture clock/generation',()=>{
  expect(incrementalSessionConfigHash({...identity,generation:'3',high:'4',retainedFrom:new Date(),config:{nested:{a:1,b:2},session_timeout_minutes:30}})).toBe(incrementalSessionConfigHash(identity));
 });
 it('invalidates changes affecting session and aggregate interpretation',()=>{
  const original=incrementalSessionConfigHash(identity);
  for(const change of [{timezone:'UTC'},{privacy:true},{retentionDays:31},{config:{session_timeout_minutes:31}},{goals:[{id:'g',type:'page',config:{path:'/a'}}]},{funnels:[{id:'f',steps:[{type:'event',value:'signup'}]}]}])expect(incrementalSessionConfigHash({...identity,...change})).not.toBe(original);
 });
});
