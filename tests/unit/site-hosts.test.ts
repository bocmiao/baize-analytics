import {describe,it,expect} from 'vitest';
import {validSiteAliases,siteAllowsOrigin} from '../../src/server/site-hosts.js';
describe('explicit site host configuration',()=>{
 it('accepts exact registered aliases only within the same public/private registrable domain',()=>{
  expect(validSiteAliases('example.test',['a.example.test','b.example.test'])).toBe(true);
  for(const hosts of [['evil.test'],['*.example.test'],['example.test.evil.test'],['co.uk'],['127.0.0.1'],['github.io']])expect(validSiteAliases('example.test',hosts)).toBe(false);
  expect(validSiteAliases('alice.github.io',['bob.github.io'])).toBe(false);expect(validSiteAliases('localhost:3000',[])).toBe(true);
 });
 it('preserves primary host semantics and requires exact HTTPS aliases without widening Origin defaults',()=>{
  const site={domain:'example.test',config:{allowed_hosts:['a.example.test']}};expect(siteAllowsOrigin(site,'http://example.test')).toBe(true);expect(siteAllowsOrigin(site,'https://a.example.test')).toBe(true);
  for(const origin of ['http://a.example.test','https://b.example.test','https://a.example.test:444','https://example.test.evil.test','https://secret@a.example.test','invalid'])expect(siteAllowsOrigin(site,origin)).toBe(false);
  expect(siteAllowsOrigin({domain:'example.test',config:{}},'https://a.example.test')).toBe(false);
 });
});
