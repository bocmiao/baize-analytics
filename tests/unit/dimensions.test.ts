import {it,expect} from 'vitest';
import {eventDimensions,terminalDimensions} from '../../src/server/dimensions.js';
import {channelRuleSchema,type WireEvent} from '../../packages/contracts/index.js';
const event=(extra:Record<string,unknown>={})=>({referrer:'https://www.google.com/search?q=白泽',...extra}) as WireEvent;
it('uses domain boundaries for search, AI and social instead of substring matches',()=>{
 expect(eventDimensions('',event()).channel).toBe('search');expect(eventDimensions('',event()).keyword).toBe('白泽');
 expect(eventDimensions('',event({referrer:'https://notgoogle.example/search?q=secret'})).channel).toBe('referral');
 expect(eventDimensions('',event({referrer:'https://chatgpt.com.evil.test/'})).channel).toBe('referral');
 expect(eventDimensions('',event({referrer:'https://chatgpt.com/'})).channel).toBe('ai');
 expect(eventDimensions('',event({referrer:'https://m.zhihu.com/'})).channel).toBe('social');
});
it('applies ordered explicit host and UTM rule conjunctions and configurable AI hosts',()=>{
 const config={channel_rules:[{name:'partner campaign',channel:'paid',referrer_host:'partner.test',include_subdomains:true,utm_source:'campaign'},{name:'partner',channel:'social',referrer_host:'partner.test'}],ai_referrer_hosts:['model.test']};
 expect(eventDimensions('',event({referrer:'https://sub.partner.test/',utm_source:'campaign'}),{},config).channel).toBe('paid');
 expect(eventDimensions('',event({referrer:'https://sub.partner.test/',utm_source:'other'}),{},config).channel).toBe('referral');
 expect(eventDimensions('',event({referrer:'https://partner.test/',utm_source:'other'}),{},config).channel).toBe('social');
 expect(eventDimensions('',event({referrer:'https://chat.model.test/'}),{},config).channel).toBe('ai');
 expect(channelRuleSchema.safeParse({name:'all',channel:'paid'}).success).toBe(false);expect(channelRuleSchema.safeParse({name:'bad',channel:'paid',referrer_host:'*.example.test'}).success).toBe(false);
});
it('keeps all UTM dimensions and removes directly identifying search terms',()=>{
 expect(eventDimensions('',event({utm_term:'keyword',utm_content:'link-a'}))).toMatchObject({utm_term:'keyword',utm_content:'link-a'});
 for(const q of ['person@example.test','203.0.113.17','13800138000'])expect(eventDimensions('',event({referrer:'https://www.google.com/search?q='+encodeURIComponent(q)}),{}, {},'203.0.113.17').keyword).toBe('');
});

it('parses actual terminal UA, CSS screen and density without inventing devices for unknown UA',()=>{
 const phone='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
 expect(terminalDimensions(phone,{screen:'390x844',device_pixel_ratio:3})).toMatchObject({device:'mobile',browser:'Mobile Safari',os:'iOS',device_pixel_ratio:3});
 expect(terminalDimensions('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',{})).toMatchObject({browser:'Chrome',browserVersion:'120.0.0.0',os:'Windows',osVersion:'10'});
 expect(terminalDimensions('unrecognized-client',{})).toMatchObject({browserVersion:'unknown',osVersion:'unknown'});
 expect(terminalDimensions(phone,{color_depth:24})).toMatchObject({brand:'Apple',colorDepth:'24'});
 expect(terminalDimensions('Mozilla/5.0 (Linux; Android 13; Pixel C) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',{screen:'1280x800',device_pixel_ratio:2})).toMatchObject({device:'tablet',browser:'Chrome',os:'Android'});
 expect(terminalDimensions('unrecognized-client',{screen:'not-a-screen'})).toMatchObject({device:'unknown',browser:'unknown',os:'unknown',screen:'unknown'});
 expect(terminalDimensions('unrecognized-client',{})).toMatchObject({brand:'unknown',colorDepth:'unknown'});
});

it('marks advertising origin without retaining click IDs',()=>{expect(eventDimensions('',event({ad_click_source:'both'}))).toMatchObject({channel:'paid',ad_click_source:'both'});});
