import {it,expect} from 'vitest';
import {botEngine,safeBotPath,botVisitIngestSchema,botVisitWindowSchema} from '../../src/server/bot-visit-log.js';
import type {BotDecision} from '../../src/server/bot-filter.js';
import {requestBudget} from '../../src/server/request-rate-limit.js';
const detected:BotDecision={isBot:true,category:'bot',reason:'ua',ruleId:'search-crawlers',requests:1};
it('uses bounded UA families and keeps request bursts separate from claimed search crawlers',()=>{
 expect(botEngine('Mozilla Googlebot/2.1',detected)).toBe('google');
 expect(botEngine('Mozilla Baiduspider/2.0',detected)).toBe('baidu');
 expect(botEngine('GPTBot/1.0',{...detected,category:'ai',ruleId:'openai'})).toBe('openai');
 expect(botEngine('Googlebot GPTBot/1.0',{...detected,category:'ai',ruleId:'openai'})).toBe('openai');
 expect(botEngine('Googlebot',{...detected,reason:'request_burst'})).toBe('unknown');
 expect(botEngine('some-other-crawler',detected)).toBe('other');
});
it('retains only a bounded pathname and removes origin, credentials, query, fragment and embedded sender IP',()=>{
 expect(safeBotPath('https://user:password@example.test/article?token=secret#private')).toBe('/article');
 expect(safeBotPath('/a/../b?email=private@example.test#fragment')).toBe('/b');
 expect(safeBotPath('/lookup/1.2.3.4','1.2.3.4')).toBe('/lookup/[redacted-ip]');
 for(const value of ['javascript:alert(1)','data:text/html,secret','relative-path','\n/path','/a'.repeat(1100)])expect(safeBotPath(value)).toBeNull();
});
it('requires bounded date pagination and strict, retry-identifiable log batches',()=>{
 expect(botVisitWindowSchema.parse({from:'2026-11-01',to:'2026-11-30'})).toMatchObject({page:1,limit:50});
 for(const query of [{from:'2026-11-01',to:'2026-12-02'},{from:'2026-11-10',to:'2026-11-09'},{from:'2026-11-01',to:'2026-11-02',limit:101}])expect(botVisitWindowSchema.safeParse(query).success).toBe(false);
 expect(botVisitIngestSchema.safeParse({sent_at:Date.now(),visits:[]}).success).toBe(false);
 expect(botVisitIngestSchema.safeParse({sent_at:Date.now(),visits:[{id:'not-uuid',ts:Date.now(),ip:'1.2.3.4',path:'/',user_agent:'Googlebot'}]}).success).toBe(false);
 expect(botVisitIngestSchema.safeParse({sent_at:Date.now(),visits:Array(101).fill({id:'b580ea42-c179-4937-bfd2-6ba9b71fe5a4',ts:Date.now(),ip:'1.2.3.4',path:'/',user_agent:'Googlebot'})}).success).toBe(false);
});
it('exempts only the signed server ingestion route from user-token authentication budgets',()=>{
 expect(requestBudget('POST','/api/v1/sites/site-a/bot-visits/ingest')).toBeNull();
 expect(requestBudget('GET','/api/v1/sites/site-a/bot-visits/ingest')).toBe('authenticated');
 expect(requestBudget('POST','/api/v1/sites/site-a/bot-visits/ingest/extra')).toBe('authenticated');
 expect(requestBudget('GET','/api/v1/sites/site-a/bot-visits')).toBe('authenticated');
});
