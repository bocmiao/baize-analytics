import {getDomain} from 'tldts';
import {cookieDomainScope} from '../../packages/tracker/src/cookie-domain.js';
export function validSiteAliases(domain:string,hosts:string[]):boolean {
 const primary=domain.toLowerCase().split(':')[0]!;const parent=getDomain(primary,{allowPrivateDomains:true});
 return hosts.length===0||Boolean(parent&&hosts.every(host=>cookieDomainScope(host,host)===host&&getDomain(host,{allowPrivateDomains:true})===parent));
}
/** Preserve primary-host compatibility; extra hosts require explicit exact HTTPS allowlisting. */
export function siteAllowsOrigin(site:{domain:string;config:{allowed_hosts?:string[]}},origin:string):boolean {
 try{const url=new URL(origin);if(url.username||url.password)return false;if(url.host===site.domain||url.hostname===site.domain)return true;
  return url.protocol==='https:'&&!url.port&&Array.isArray(site.config.allowed_hosts)&&site.config.allowed_hosts.includes(url.hostname)&&validSiteAliases(site.domain,[url.hostname]);
 }catch{return false;}
}
