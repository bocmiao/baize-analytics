import UAParser from 'ua-parser-js';
import type {WireEvent} from '../../packages/contracts/index.js';
import {channelRuleSchema,referrerHostSchema} from '../../packages/contracts/index.js';
const ai=['chatgpt.com','openai.com','claude.ai','perplexity.ai','doubao.com','yiyan.baidu.com','metaso.cn','kimi.moonshot.cn','kimi.com'];
const search=['google.com','google.cn','google.com.hk','google.co.uk','google.co.jp','google.de','google.fr','google.com.au','bing.com','baidu.com','sogou.com','so.com','duckduckgo.com','yahoo.com'];
const social=['weixin.qq.com','wechat.com','weibo.com','facebook.com','twitter.com','x.com','t.co','zhihu.com','douyin.com','xiaohongshu.com'];
export const matchesHost=(host:string,domain:string,subdomains=true)=>host===domain||(subdomains&&host.endsWith('.'+domain));
/** Screen dimensions are CSS pixels; DPR describes density, not extra desktop width. */
export function terminalDimensions(ua:string,event:Pick<WireEvent,'screen'|'device_pixel_ratio'|'color_depth'>){
 return terminalDimensionsFromParsed(new UAParser(ua.slice(0,4096)).getResult(),event);
}
function terminalDimensionsFromParsed(parsed:ReturnType<UAParser['getResult']>,event:Pick<WireEvent,'screen'|'device_pixel_ratio'|'color_depth'>){
 const kind=parsed.device.type;
 const [width,height]=(event.screen??'').split('x').map(Number),valid=Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0&&width<=32768&&height<=32768;
 const size=valid?Math.min(width,height):undefined;
 const device=kind==='tablet'?'tablet':kind==='mobile'?(size!==undefined&&size>=600?'tablet':'mobile'):kind?kind:parsed.browser.name||parsed.os.name?(size!==undefined&&size<600?'mobile':size!==undefined&&size<1024?'tablet':'desktop'):'unknown';
 return {device,brand:parsed.device.vendor??'unknown',colorDepth:event.color_depth?String(event.color_depth):'unknown',browser:parsed.browser.name??'unknown',os:parsed.os.name??'unknown',screen:valid?`${width}x${height}`:'unknown',device_pixel_ratio:event.device_pixel_ratio??null};
}
/** Classification only: configurable domain strings never initiate DNS or network access. */
export function eventDimensions(ua:string,event:WireEvent,geo:Record<string,string>={},config:Record<string,unknown>={},ip=''){
 return eventDimensionsWithTerminal(event,geo,config,ip,terminalDimensions(ua,event));
}
/** Request-local UA parsing; event URL, UTM, screen and DPR remain per-event. */
export function prepareEventDimensions(ua:string,geo:Record<string,string>={},config:Record<string,unknown>={},ip=''){
 const parsed=new UAParser(ua.slice(0,4096)).getResult();
 return (event:WireEvent)=>eventDimensionsWithTerminal(event,geo,config,ip,terminalDimensionsFromParsed(parsed,event));
}
function eventDimensionsWithTerminal(event:WireEvent,geo:Record<string,string>,config:Record<string,unknown>,ip:string,terminal:ReturnType<typeof terminalDimensions>){
 let reference:URL|undefined;try{reference=new URL(event.referrer??'');}catch{/* No referrer. */}
 const host=reference?.hostname.toLowerCase()??'',medium=(event.utm_medium??'').toLowerCase();
 const customAi=Array.isArray(config.ai_referrer_hosts)?config.ai_referrer_hosts.map(value=>referrerHostSchema.safeParse(value)).filter(result=>result.success).map(result=>result.data!):[];
 let channel=medium==='email'?'email':(/^(cpc|paid|ppc|paidsearch|paid_social)$/.test(medium)||!!event.ad_click_source)?'paid':[...ai,...customAi].some(domain=>matchesHost(host,domain))?'ai':search.some(domain=>matchesHost(host,domain))?'search':social.some(domain=>matchesHost(host,domain))?'social':host?'referral':'direct';
 for(const raw of Array.isArray(config.channel_rules)?config.channel_rules:[]){const parsed=channelRuleSchema.safeParse(raw);if(!parsed.success)continue;const rule=parsed.data;if(rule.referrer_host&&!matchesHost(host,rule.referrer_host,rule.include_subdomains))continue;if(rule.utm_medium!==undefined&&rule.utm_medium!==event.utm_medium)continue;if(rule.utm_source!==undefined&&rule.utm_source!==event.utm_source)continue;channel=rule.channel;break;}
 let keyword='';if(channel==='search'&&reference){const key=matchesHost(host,'baidu.com')?'wd':matchesHost(host,'sogou.com')?'query':'q';keyword=(reference.searchParams.get(key)??'').slice(0,128);if(keyword===ip||/@|\b(?:\d{1,3}\.){3}\d{1,3}\b|\d{7,}/.test(keyword))keyword='';}
 return {country:'unknown',region:'unknown',city:'unknown',...geo,...terminal,language:event.language??'unknown',channel,referrer:host,keyword,ad_click_source:event.ad_click_source??'',utm_source:event.utm_source??'',utm_medium:event.utm_medium??'',utm_campaign:event.utm_campaign??'',utm_term:event.utm_term??'',utm_content:event.utm_content??''};
}
