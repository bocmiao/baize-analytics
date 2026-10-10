import {sanitizeDailyFactProperties} from '../../src/server/fact-privacy.js';
import {invalidateFactSegments,rebasePublishedFactEpoch} from '../../src/server/fact-invalidation.js';
import {queryAiPublishedSeries} from '../../src/server/ai-fact-query.js';
import {queryStats} from '../../src/server/analytics.js';
import {runWorkerOnce,enforceRetention} from '../../src/server/worker.js';
import {queryStatsRelational} from '../../src/server/relational-stats.js';
import type {AppContext} from '../../src/server/context.js';
import {queryPublishedNumericBuckets} from '../../src/server/fact-numeric-query.js';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {describe,it,expect} from 'vitest';
import {migrate,beginPartitionSnapshot,lockSite} from '../../src/server/db.js';
import {buildSessionFacts,readFactBuckets} from '../../src/server/session-facts.js';
import {createFactEffectSink} from '../../src/server/fact-provenance.js';
import {queryRunMembers,queryPublishedMembers,publishFactHourReferences} from '../../src/server/fact-member-query.js';
import {streamSiteEventBatches} from '../../src/server/event-store.js';
import type {AnalyticsEvent} from '../../src/server/analytics.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)('real PG exact event-time relational membership',()=>{
 it('unions cross-day visitors and funnel steps in SQL, filters provenance and avoids large compatibility member arrays',async()=>{
 const schema=`members_${randomUUID().replaceAll('-','')}`,site=randomUUID(),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:1});
 await admin.query(`CREATE SCHEMA ${schema}`);try{await migrate(pool);await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'members','example.test','secret')",[site]);await pool.query('INSERT INTO aggregation_state(site_id,generation) VALUES($1,1)',[site]);
 const goalA=randomUUID(),goalB=randomUUID();for(const goal of [goalA,goalB])await pool.query("INSERT INTO goals(id,site_id,name,type,config) VALUES($1,$2,'finish','page',$3)",[goal,site,{path:'/finish'}]);
 const wire=(visitor:string,ts:string,path:string,channel:string):AnalyticsEvent=>({site_id:site,event_id:randomUUID(),page_id:randomUUID(),visitor_id:visitor,ts,type:'pageview',path,payload:{},dimensions:{channel,utm_source:channel,device:'desktop'}});
 const events=[wire('same','2026-10-01T00:00:00Z','/start','constructor'),wire('same','2026-10-01T00:01:00Z','/finish','direct'),wire('same','2026-10-02T00:00:00Z','/start','search'),wire('same','2026-10-02T00:01:00Z','/finish','direct')];for(let i=0;i<200;i++)events.push(wire(`other-${i}`,'2026-10-02T00:02:00Z','/start','search'));
 for(let i=0;i<26;i++){const day=i===25?'02':'01';events.push({...wire('same',`2026-10-${day}T00:03:00Z`,'/start','search'),type:'vitals',payload:{vitals:{lcp:i===25?10000:100}}});}
 for(const [currency,revenue]of [['CNY',12],['USD',3]] as const)events.push({...wire('same','2026-10-02T00:04:00Z','/finish','direct'),type:'revenue',payload:{currency,revenue,order_id:`order-${currency}`}});
 events.push({...wire('same','2026-10-02T00:05:00Z','/finish','direct'),type:'event',payload:{event_name:'signup',props:{customer_id:'stable-example',email:'someone@example.test',campaign:'spring',['__proto__']:'constructor'}}});
 await pool.query(`INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions) SELECT site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions FROM jsonb_to_recordset($1) AS e(site_id text,event_id uuid,ts timestamptz,visitor_id text,page_id uuid,type text,path text,payload jsonb,dimensions jsonb)`,[JSON.stringify(events)]);
 const client=await pool.connect();try{await beginPartitionSnapshot(client);await client.query("SET LOCAL work_mem='64kB'");const epoch=(await client.query('SELECT epoch::text FROM aggregation_state WHERE site_id=$1',[site])).rows[0].epoch;
 const run=await buildSessionFacts(client,{siteId:site,epoch,generation:'1',outboxHighWatermark:'0'},{timezone:'UTC',privacy:false,timeoutMs:1800000,goals:[{id:goalA,type:'page',config:{path:'/finish'}},{id:goalB,type:'page',config:{path:'/finish'}}],funnels:[{id:'__proto__',strict:false,steps:[{type:'page',value:'/start'},{type:'page',value:'/finish'}]}],effects:createFactEffectSink(client,new Date('2026-01-01'))},(async function*(){for await(const batch of streamSiteEventBatches(pool,site,{client},30))yield batch.events;})());
 const members=await queryRunMembers(client,run,'2026-10-01T00:00:00Z','2026-10-03T00:00:00Z');expect(members.uv).toBe(201);expect(members.pageUV).toEqual({'/finish':1,'/start':201});expect(members.funnels['__proto__']).toEqual([201,1]);expect(members.trendUV).toEqual({'2026-10-01T00:00:00.000Z':1,'2026-10-02T00:00:00.000Z':201});expect(JSON.stringify(members)).not.toContain('other-199');
 const precise=await queryRunMembers(client,run,'2026-10-01T00:00:30Z','2026-10-01T00:01:30Z',{path:'/finish',channel:'direct'});expect(precise.uv).toBe(1);expect(precise.pageUV).toEqual({'/finish':1});expect(precise.funnels).toEqual({});
 expect((await queryRunMembers(client,run,'2026-10-01T00:00:00Z','2026-10-03T00:00:00Z',{utm_source:'constructor'})).uv).toBe(1);
 await expect((async()=>{for await(const _bucket of readFactBuckets(client,run,'hourly',512)){/* Compatibility output has a real byte budget. */}})()).rejects.toThrow('FACT_BUCKET_BUDGET');
 await publishFactHourReferences(client,site,run,new Date('2026-01-01'));expect((await client.query('SELECT count(*)::int AS n FROM analytics_relational_buckets WHERE site_id=$1',[site])).rows[0].n).toBe(2);expect((await client.query('SELECT query_version FROM analytics_fact_runs WHERE id=$1',[run])).rows[0].query_version).toBe(2);await client.query("UPDATE analytics_fact_runs SET status='published' WHERE id=$1",[run]);
 await client.query("INSERT INTO stats_hourly(site_id,hour,data,generation) VALUES($1,'2025-12-31T23:00:00Z',$2,1)",[site,JSON.stringify({visitors:['same','archived'],pages:{'/start':{visitors:['same','archived']}},segments:{},events:{},funnels:{['__proto__']:[['archived']]}})]);
 const published=await queryPublishedMembers(client,site,'2025-12-31T23:00:00Z','2026-10-03T00:00:00Z');expect(published.uv).toBe(202);expect(published.pageUV['/start']).toBe(202);expect(published.funnels['__proto__']).toEqual([202,1]);
 for await(const bucket of readFactBuckets(client,run,'hourly',16000,false))await client.query('INSERT INTO stats_hourly(site_id,hour,data,generation) VALUES($1,$2,$3,1)',[site,bucket.bucket,JSON.stringify({...bucket.data,relationalVersion:2})]);
 await client.query('UPDATE aggregation_state SET processed_generation=generation WHERE site_id=$1',[site]);
 const stats=await queryStatsRelational({pool} as AppContext,site,'2026-10-01T00:00:00Z','2026-10-03T00:00:00Z',{}, {client});expect(stats?.totals.pv).toBe(204);expect(stats?.totals.uv).toBe(201);expect(stats?.funnels['__proto__']).toEqual([201,1]);expect(stats?.distinctStorage).toBe('postgres_relation');expect(stats?.totals.revenueByCurrency).toEqual({CNY:12,USD:3});expect(stats?.totals.revenue).toBeNull();expect(stats?.vitals[0]?.sampleCount).toBe(26);expect(stats?.vitals[0]?.p75).toBe(100);
 const aiBase={from:'2026-10-01T00:00:00Z',to:'2026-10-03T00:00:00Z'};
 const aiUV=await queryAiPublishedSeries(client,site,{...aiBase,metric:'uv',dimension:'day'},'UTC');expect(aiUV.rows).toEqual([{key:'2026-10-01',value:1},{key:'2026-10-02',value:201}]);
 const aiFiltered=await queryAiPublishedSeries(client,site,{...aiBase,metric:'uv',dimension:'source',filters:{source:'constructor'}},'UTC');expect(aiFiltered.rows).toEqual([{key:'constructor',value:1}]);
 const aiPV=await queryAiPublishedSeries(client,site,{...aiBase,metric:'pv',dimension:'page'},'UTC');expect(aiPV.rows).toEqual([{key:'/finish',value:2},{key:'/start',value:202}]);
 const aiRate=await queryAiPublishedSeries(client,site,{...aiBase,metric:'conversion_rate',dimension:'day'},'UTC');expect(aiRate.status).toBe('ok');expect(aiRate.rows).toEqual([{key:'2026-10-01',value:1,numerator:1,denominator:1},{key:'2026-10-02',value:1/201,numerator:1,denominator:201}]);
 const numerics=await queryPublishedNumericBuckets(client,site,'2026-10-01T00:00:00Z','2026-10-03T00:00:00Z');expect([...numerics.values()].reduce((n,b)=>n+b.pv,0)).toBe(204);expect([...numerics.values()].every(b=>b.visitors.length===0)).toBe(true);
 const minute=await queryPublishedNumericBuckets(client,site,'2026-10-01T00:00:30Z','2026-10-01T00:01:30Z',{path:'/finish'});expect([...minute.values()].reduce((n,b)=>n+b.pv,0)).toBe(1);
 const filtered=await queryPublishedMembers(client,site,'2025-12-31T23:00:00Z','2026-10-03T00:00:00Z',{utm_source:'constructor'});expect(filtered.uv).toBe(1);
 await client.query("UPDATE sites SET privacy_mode='daily_salt' WHERE id=$1",[site]);expect((await sanitizeDailyFactProperties(client,site)).removed).toBeGreaterThan(0);
 const cleaned=(await client.query("SELECT data->'events'->'signup'->'properties' AS props FROM stats_hourly WHERE site_id=$1 AND data->'events' ? 'signup'",[site])).rows[0].props;expect(cleaned).toEqual({campaign:{spring:1},['__proto__']:{constructor:1}});expect((await client.query("SELECT count(*)::int n FROM analytics_effect_facts WHERE metric='property' AND key->>1 IN('customer_id','email')")).rows[0].n).toBe(0);expect((await queryPublishedMembers(client,site,'2026-10-01T00:00:00Z','2026-10-03T00:00:00Z')).uv).toBe(201);
 expect(pool.waitingCount).toBe(0);await client.query('ROLLBACK');
 }finally{await client.query('ROLLBACK');client.release();}
 expect(await runWorkerOnce(pool)).toBe(true);
 const live=await queryStats({pool} as AppContext,site,'2026-10-01T00:00:00Z','2026-10-03T00:00:00Z');expect(live.totals.pv).toBe(204);expect(live.totals.uv).toBe(201);expect('distinctStorage' in live&&live.distinctStorage).toBe('postgres_relation');expect(live.totals.revenueByCurrency).toEqual({CNY:12,USD:3});expect(live.vitals[0]?.p75).toBe(100);
 const persisted=(await pool.query('SELECT data FROM stats_hourly WHERE site_id=$1 ORDER BY hour',[site])).rows;expect(persisted.every(row=>row.data.visitors.length===0&&row.data.relationalVersion===2)).toBe(true);expect(pool.waitingCount).toBe(0);
 await pool.query('UPDATE sites SET retention_days=1 WHERE id=$1',[site]);expect(await enforceRetention(pool)).toBe(events.length);expect((await pool.query('SELECT count(*)::int n FROM events WHERE site_id=$1',[site])).rows[0].n).toBe(0);
 await pool.query('UPDATE aggregation_state SET generation=generation+1 WHERE site_id=$1',[site]);expect(await runWorkerOnce(pool)).toBe(true);
 const archivedStats=await queryStats({pool} as AppContext,site,'2026-10-01T00:00:00Z','2026-10-03T00:00:00Z');expect(archivedStats.totals.pv).toBe(204);expect(archivedStats.totals.uv).toBe(201);expect(archivedStats.vitals[0]?.sampleCount).toBe(26);expect(archivedStats.totals.revenueByCurrency).toEqual({CNY:12,USD:3});
 const deleting=await pool.connect();try{await deleting.query('BEGIN');await lockSite(deleting,site);const erased=await invalidateFactSegments(deleting,site,[{visitorId:'same'}]);expect(erased.relational).toBe(true);expect(erased.partial).toBe(false);await deleting.query('UPDATE aggregation_state SET epoch=gen_random_uuid(),generation=generation+1 WHERE site_id=$1',[site]);await rebasePublishedFactEpoch(deleting,site);await deleting.query('COMMIT');}finally{deleting.release();}
 const afterDelete=await queryStats({pool} as AppContext,site,'2026-10-01T00:00:00Z','2026-10-03T00:00:00Z');expect(afterDelete.totals.uv).toBe(200);expect(afterDelete.totals.pv).toBe(200);expect(afterDelete.totals.revenueByCurrency).toEqual({});expect(afterDelete.vitals).toEqual([]);expect((await pool.query("SELECT count(*)::int n FROM analytics_effect_facts WHERE visitor_id='same'")).rows[0].n).toBe(0);expect((await pool.query('SELECT count(*)::int n FROM analytics_vital_samples')).rows[0].n).toBe(0);
 const segmentClient=await pool.connect();try{await segmentClient.query('BEGIN');await lockSite(segmentClient,site);const partial=await invalidateFactSegments(segmentClient,site,[{visitorId:'other-0',from:'2026-10-02T00:01:00Z',to:'2026-10-02T00:03:00Z'}]);expect(partial.partial).toBe(true);expect((await queryPublishedMembers(segmentClient,site,'2026-10-01T00:00:00Z','2026-10-03T00:00:00Z')).uv).toBe(199);await segmentClient.query('COMMIT');}finally{segmentClient.release();}
 await expect(queryStats({pool} as AppContext,site,'2026-10-01T00:00:00Z','2026-10-03T00:00:00Z')).rejects.toMatchObject({code:'aggregate_members_unavailable'});


 }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
 });
});
