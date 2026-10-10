import {getDomain,getPublicSuffix} from 'tldts';
import {cookieDomainScope} from '../../packages/tracker/src/cookie-domain.js';
/** The PSL including private hosting suffixes is authoritative; no suffix guessing. */
export function validateCookieDomain(cookieDomain:unknown,originHost:string,siteDomain:string,allowedHosts:string[]=[]):string|null {
 const hostname=originHost.toLowerCase(),siteHost=siteDomain.toLowerCase().split(':')[0]!;
 if(![siteHost,...allowedHosts.map(host=>host.toLowerCase())].includes(hostname))return null;
 const domain=cookieDomainScope(cookieDomain,hostname);if(!domain)return null;
 const options={allowPrivateDomains:true};
 if(!getDomain(domain,options)||getPublicSuffix(domain,options)===domain||getDomain(domain,options)!==getDomain(siteHost,options))return null;
 return domain;
}
