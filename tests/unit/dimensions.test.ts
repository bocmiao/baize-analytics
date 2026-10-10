import {it,expect} from 'vitest';
import {eventDimensions} from '../../src/server/dimensions.js';
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
