import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {customerRecords,JobStatus} from '../../src/web/WorkspaceRecords';

describe('customer record presentation',()=>{
 it('retains actual scheduling fields and audit attribution',()=>{
  const schedule={id:'schedule',cadence:'weekly',report_id:'report',channel_id:'channel',enabled:true,next_at:'2026-11-12T00:00:00Z'};
  expect(customerRecords([schedule],'schedules')[0]).toEqual(schedule);
  const audit={created_at:'2026-11-10T00:00:00Z',action:'share.revoke',actor_id:'owner',target:{id:'share'}};
  expect(customerRecords([audit],'audit')[0]).toEqual(audit);
 });
 it('distinguishes revoked shares and excludes stored secret fields',()=>{
  const items=[{id:'a',revoked:false,expires_at:null,token_hash:'secret',password_hash:'secret'},{id:'b',revoked:true,expires_at:null,token_hash:'secret'}];
  expect(customerRecords(items,'shares')).toEqual([{id:'a',revoked:false,expires_at:null},{id:'b',revoked:true,expires_at:null}]);
  expect(customerRecords([{id:'t',scopes:['read'],revoked:true,token_hash:'secret'}],'tokens')[0]).toEqual({id:'t',scopes:['read'],revoked:true});
 });
 it.each([
  [{},'暂无处理记录'],
  [{aggregation:{generation:3,processed_generation:2}},'处理中'],
  [{aggregation:{generation:3,processed_generation:3}},'已完成'],
  [{aggregation:{generation:3,processed_generation:2,last_error:'failed'}},'需要处理'],
 ])('shows a factual task state', (data,text)=>{
  const html=renderToStaticMarkup(createElement(JobStatus,{data,onRetry:()=>undefined}));
  expect(html).toContain(text);if(!('aggregation' in data))expect(html).not.toContain('已完成');
 });
});
