import {describe,it,expect} from 'vitest';
import {sanitizeDailyCacheBucket} from '../../src/server/daily-cache-privacy.js';
import {canonical} from '../../src/server/security.js';
function safe(body:unknown){return canonical(sanitizeDailyCacheBucket(body))===canonical(body);}
describe('daily cache Bucket privacy schema',()=>{
 it('preserves real aggregate device namespace, counts and encoded dimensions without mutating source',()=>{
  const body={relationalVersion:2,pv:3,visitors:['daily-hmac'],audience:{device:{desktop:1,mobile:1,tablet:0,unknown:1},country:{CN:3}},segments:{[JSON.stringify({path:'/guide',device:'desktop',channel:'search'})]:{pv:1,visitors:['daily-hmac'],dimensions:{device:'mobile',channel:'search'}}},events:{signup:{count:1,properties:{plan:{free:1}}}}};
  const before=canonical(body);expect(safe(body)).toBe(true);expect(canonical(body)).toBe(before);
 });
 it.each(['user_id','visitorId','device_id','accountId','email','authorization','token'])('still refuses known stable alias %s in ordinary properties and dimension keys',alias=>{
  expect(safe({relationalVersion:2,events:{signup:{properties:{[alias]:{secret:1}}}}})).toBe(false);
  expect(()=>sanitizeDailyCacheBucket({segments:{[JSON.stringify({path:'/',device:'desktop',[alias]:'secret'})]:{pv:1}}})).toThrow('CACHE_MIGRATION_DAILY_UNSAFE_BODY');
 });
 it('does not exempt arbitrary device identifiers or identity children at categorical paths',()=>{
  expect(safe({audience:{device:{'stable-device-123':1}}})).toBe(false);
  expect(safe({audience:{device:{desktop:{visitor_id:'secret'}}}})).toBe(false);
  expect(safe({segments:{'{}':{dimensions:{device:'stable-device-123'}}}})).toBe(false);
  expect(safe({device:'desktop'})).toBe(false);
 });
 it('keeps email-shaped dimensions unsafe and malformed encoded keys fail closed',()=>{
  expect(()=>sanitizeDailyCacheBucket({segments:{'{bad':{pv:1}}})).toThrow();
  expect(()=>sanitizeDailyCacheBucket({segments:{'{"channel":"alice@example.com"}':{pv:1}}})).toThrow();
 });
 it('permits empty categorical counts and routing metadata without creating data',()=>{
  expect(safe({relationalVersion:2})).toBe(true);
  expect(safe({audience:{device:{}}})).toBe(true);
 });
});
