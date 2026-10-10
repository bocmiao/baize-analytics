import type {WireEvent} from '../../packages/contracts/index.js';
import {channelRuleSchema,referrerHostSchema} from '../../packages/contracts/index.js';
const ai=['chatgpt.com','openai.com','claude.ai','perplexity.ai','doubao.com','yiyan.baidu.com','metaso.cn','kimi.moonshot.cn','kimi.com'];
const search=['google.com','google.cn','google.com.hk','google.co.uk','google.co.jp','google.de','google.fr','google.com.au','bing.com','baidu.com','sogou.com','so.com','duckduckgo.com','yahoo.com'];
const social=['weixin.qq.com','wechat.com','weibo.com','facebook.com','twitter.com','x.com','t.co','zhihu.com','douyin.com','xiaohongshu.com'];
export const matchesHost=(host:string,domain:string,subdomains=true)=>host===domain||(subdomains&&host.endsWith('.'+domain));
/** Classification only: configurable domain strings never initiate DNS or network access. */
export function eventDimensions(ua:string,event:WireEvent,geo:Record<string,string>={},config:Record<string,unknown>={},ip=''){
 let reference:URL|undefined;try{reference=new URL(event.referrer??'');}catch{/* No referrer. */}
 const host=reference?.hostname.toLowerCase()??'',medium=(event.utm_medium??'').toLowerCase();
 const customAi=Array.isArray(config.ai_referrer_hosts)?config.ai_referrer_hosts.map(value=>referrerHostSchema.safeParse(value)).filter(result=>result.success).map(result=>result.data!):[];
 let channel=medium==='email'?'email':/^(cpc|paid|ppc|paidsearch|paid_social)$/.test(medium)?'paid':[...ai,...customAi].some(domain=>matchesHost(host,domain))?'ai':search.some(domain=>matchesHost(host,domain))?'search':social.some(domain=>matchesHost(host,domain))?'social':host?'referral':'direct';
 for(const raw of Array.isArray(config.channel_rules)?config.channel_rules:[]){const parsed=channelRuleSchema.safeParse(raw);if(!parsed.success)continue;const rule=parsed.data;if(rule.referrer_host&&!matchesHost(host,rule.referrer_host,rule.include_subdomains))continue;if(rule.utm_medium!==undefined&&rule.utm_medium!==event.utm_medium)continue;if(rule.utm_source!==undefined&&rule.utm_source!==event.utm_source)continue;channel=rule.channel;break;}
 let keyword='';if(channel==='search'&&reference){const key=matchesHost(host,'baidu.com')?'wd':matchesHost(host,'sogou.com')?'query':'q';keyword=(reference.searchParams.get(key)??'').slice(0,128);if(keyword===ip||/@|\b(?:\d{1,3}\.){3}\d{1,3}\b|\d{7,}/.test(keyword))keyword='';}
 return {country:'unknown',region:'unknown',city:'unknown',...geo,device:/ipad|tablet/i.test(ua)?'tablet':/mobile|android|iphone/i.test(ua)?'mobile':'desktop',browser:/edg\//i.test(ua)?'Edge':/chrome|chromium/i.test(ua)?'Chrome':/firefox/i.test(ua)?'Firefox':/safari/i.test(ua)?'Safari':'unknown',os:/windows/i.test(ua)?'Windows':/android/i.test(ua)?'Android':/iphone|ipad/i.test(ua)?'iOS':/macintosh/i.test(ua)?'macOS':/linux/i.test(ua)?'Linux':'unknown',screen:event.screen??'unknown',language:event.language??'unknown',channel,referrer:host,keyword,utm_source:event.utm_source??'',utm_medium:event.utm_medium??'',utm_campaign:event.utm_campaign??'',utm_term:event.utm_term??'',utm_content:event.utm_content??''};
}
