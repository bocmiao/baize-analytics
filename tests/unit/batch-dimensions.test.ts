import {describe,it,expect} from 'vitest';
import {eventDimensions,prepareEventDimensions} from '../../src/server/dimensions.js';
import type {WireEvent} from '../../packages/contracts/index.js';
describe('request-local UA parsing',()=>{
 it('preserves per-event screens, UTM, rules and private keyword filtering',()=>{
  const config={ai_referrer_hosts:['custom-ai.test'],channel_rules:[{referrer_host:'rule.test',utm_source:'special',channel:'email'}]},geo={country:'CN'},ip='192.0.2.1';
  for(const ua of ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36','Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1','unknown']){
   const prepared=prepareEventDimensions(ua,geo,config,ip);
   for(let i=0;i<50;i++){const event={type:'pageview',url:'https://example.test',path:'/',ts:Date.now(),event_id:'e',page_id:'p',screen:['390x844','1280x720','800x1200','bad'][i%4],device_pixel_ratio:i%3+1,referrer:['https://google.com/search?q=hello','https://google.com/search?q=192.0.2.1','https://custom-ai.test','https://rule.test'][i%4],utm_source:i%2?'special':'ordinary',utm_medium:i%3?'':'cpc',language:i%2?'zh-CN':'en'} as WireEvent;
    expect(prepared(event)).toEqual(eventDimensions(ua,event,geo,config,ip));
   }
  }
 });
});
