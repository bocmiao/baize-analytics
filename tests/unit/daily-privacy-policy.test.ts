import {describe,it,expect} from 'vitest';
import {sanitizeDailyPayload,sanitizeDailyDimensions} from '../../src/server/daily-privacy-policy.js';
describe('daily known identifier policy',()=>{
 it('cleans every known payload string and nested alias, preserving controlled protocol columns',()=>{
 const input={event_id:'uuid',ts:123,type:'pageview',page_id:'raw',visitor_id:'raw',title:'person@example.test',utm_source:'person@example.test',user_id:'stable',props:{deviceId:'stable',accepted:true,items:['safe','person@example.test']}};
 expect(sanitizeDailyPayload(input,{visitorId:'day-visitor',pageId:'day-page'})).toEqual({event_id:'uuid',ts:123,type:'pageview',page_id:'day-page',visitor_id:'day-visitor',props:{accepted:true,items:['safe']}});
 expect(input.page_id).toBe('raw');
 });
 it('cleans dimension aliases/email while retaining device enum and business values',()=>{
 expect(sanitizeDailyDimensions({device:'mobile',customer_id:'old',campaign:'mail@example.test',browser:'Firefox',medium:'newsletter'})).toEqual({device:'mobile',browser:'Firefox',medium:'newsletter'});
 });
});
