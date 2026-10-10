/** MIT License. Copyright (c) Baize contributors. */
/** Syntax/scope gate only; the trusted config endpoint must also validate the public suffix list. */
export function cookieDomainScope(value:unknown,hostname:string):string|null {
 if(typeof value!=='string')return null;
 const domain=value.toLowerCase().replace(/^\./,'');const host=hostname.toLowerCase();
 if(domain.length>253||!domain.includes('.')||!/^[a-z0-9.-]+$/.test(domain)||/^\d[\d.]*$/.test(domain)||domain.split('.').some(label=>!label||label.length>63||! /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)))return null;
 return host===domain||host.endsWith('.'+domain)?domain:null;
}
