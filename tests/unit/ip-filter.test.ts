import {describe,it,expect} from 'vitest';
import {ipFilterSchema,normalizeIPFilter,matchesIPFilter} from '../../src/server/ip-filter.js';
import {matchesCIDR} from '../../src/server/security.js';
describe('single IP, CIDR and inclusive address ranges',()=>{
 it('normalizes both address families and mapped aliases',()=>{expect(normalizeIPFilter(' 192.0.2.7 ')).toBe('192.0.2.7');expect(normalizeIPFilter('2001:0db8:0:0:0:0:0:1')).toBe('2001:db8::1');expect(normalizeIPFilter('::ffff:192.0.2.7')).toBe('192.0.2.7');expect(normalizeIPFilter('192.0.2.7/24')).toBe('192.0.2.0/24');expect(normalizeIPFilter('::ffff:192.0.2.7/120')).toBe('192.0.2.0/24');});
 it('matches exact identities instead of silently ignoring single addresses',()=>{expect(matchesCIDR('192.0.2.7','192.0.2.7')).toBe(true);expect(matchesIPFilter('::ffff:192.0.2.7','192.0.2.7')).toBe(true);expect(matchesIPFilter('192.0.2.8','192.0.2.7')).toBe(false);expect(matchesIPFilter('2001:db8::1','2001:db8::1')).toBe(true);});
 it('includes endpoints of IPv4 and IPv6 ranges but excludes outside addresses',()=>{for(const value of ['192.0.2.7','192.0.2.10','192.0.2.20'])expect(matchesIPFilter(value,'192.0.2.7 - 192.0.2.20')).toBe(true);expect(matchesIPFilter('192.0.2.21','192.0.2.7-192.0.2.20')).toBe(false);expect(matchesIPFilter('2001:db8::f','2001:db8::1-2001:db8::ff')).toBe(true);expect(matchesIPFilter('2001:db8::100','2001:db8::1-2001:db8::ff')).toBe(false);});
 it.each(['bad','192.0.2.999','192.0.2.2-192.0.2.1','192.0.2.1-2001:db8::1','192.0.2.7/33','2001:db8::/129','fe80::1%eth0','fe80::1%eth0/64','::ffff:192.0.2.7/80'])('rejects invalid rule %s before persistence',value=>{expect(ipFilterSchema.safeParse(value).success).toBe(false);expect(matchesIPFilter('192.0.2.1',value)).toBe(false);});
});
