import {it,expect} from 'vitest';
import {validateCookieDomain} from '../../src/server/cookie-domain-server.js';
it('uses full ICANN/private PSL and explicit site hosts to reject public suffix, IP, deceptive parent and unregistered subdomains',()=>{
 expect(validateCookieDomain('.example.co.uk','shop.example.co.uk','example.co.uk',['shop.example.co.uk'])).toBe('example.co.uk');
 expect(validateCookieDomain('tenant.github.io','shop.tenant.github.io','tenant.github.io',['shop.tenant.github.io'])).toBe('tenant.github.io');
 expect(validateCookieDomain('github.io','tenant.github.io','tenant.github.io')).toBeNull();
 expect(validateCookieDomain('co.uk','shop.example.co.uk','example.co.uk',['shop.example.co.uk'])).toBeNull();
 expect(validateCookieDomain('com','shop.example.com','example.com',['shop.example.com'])).toBeNull();
 expect(validateCookieDomain('example.com','unregistered.example.com','example.com')).toBeNull();
 expect(validateCookieDomain('example.com','otherexample.com','example.com',['otherexample.com'])).toBeNull();
 expect(validateCookieDomain('example.com','shop.example.com','another.com',['shop.example.com'])).toBeNull();
 expect(validateCookieDomain('127.0.0.1','127.0.0.1','127.0.0.1')).toBeNull();
});
