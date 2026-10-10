import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {describe,it,expect} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {CanonicalClickHouse,installCanonicalStore} from '../../src/server/canonical-clickhouse.js';
import {ClickHouseCacheStore,installCacheStore,cacheRowKey,type CacheKind} from '../../src/server/cache-store.js';
import {materializeCanonicalHeatmap} from '../../src/server/canonical-heatmap.js';
import type {StoredEvent} from '../../src/server/clickhouse-store.js';

describe.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('canonical heatmap bounded base and committed raw delta',()=>{
 it('keeps expired legacy counts, adds late/new coordinates once, rejects unavailable evidence and never borrows the locked pool',async()=>{
  const schema='heatmap_'+randomUUID().replaceAll('-',''),site=randomUUID(),epoch=randomUUID(),aggregationEpoch=randomUUID(),owner=randomUUID(),visitor=randomUUID();
  const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,options:`-c search_path=${schema}`});
  const config={url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'},raw=new CanonicalClickHouse(config),cache=new ClickHouseCacheStore(config);
  await admin.query(`CREATE SCHEMA ${schema}`);
  try{
   await migrate(pool);await raw.initialize();await cache.initialize();installCanonicalStore(pool,raw);installCacheStore(pool,cache);
   await pool.query("INSERT INTO sites(id,name,domain,salt_secret)VALUES($1,'heatmap','example.test','heatmap-seal')",[site]);
   await pool.query('INSERT INTO aggregation_state(site_id,epoch,generation,processed_generation)VALUES($1,$2,1,1)',[site,aggregationEpoch]);
   await pool.query("INSERT INTO canonical_event_authority(site_id,epoch,authority,body_mode)VALUES($1,$2,'clickhouse','strict')",[site,epoch]);
   const c=await pool.connect();try{
    await c.query('BEGIN');
    const event=(x:number,ts=Date.now()-60000):StoredEvent=>({site_id:site,event_id:randomUUID(),ts:new Date(ts),visitor_id:visitor,page_id:randomUUID(),type:'heatmap',path:'/',payload:{heatmap:{kind:'click',x,y:.7,width:1280,height:720}},dimensions:{},is_bot:false});
    const publish=async(events:StoredEvent[])=>{for(const e of events)await c.query('INSERT INTO event_keys(site_id,event_id,hash,ts,visitor_id)VALUES($1,$2,$3,$4,$5)',[site,e.event_id,e.event_id,e.ts,e.visitor_id]);await raw.publishBatch(c,site,randomUUID(),epoch,events.map(e=>({event:e,acceptedHash:e.event_id})));};
    const covered=event(.25);await publish([covered]);
    const base={site_id:site,path:'/',kind:'click',x:25,y:70,viewport:1300,count:'19'};
    const fence={expectedAggregationEpoch:aggregationEpoch,expectedGeneration:'1',verifyLiveFence:async()=>{}};
    await cache.stageRows(c,site,owner,'heatmap_cache',[base],fence);await cache.completeOwnerKind(c,site,owner,'heatmap_cache',1,fence);await cache.publishBucket(c,site,owner,'heatmap_cache',cacheRowKey('heatmap_cache',base),fence);await cache.captureHeatmapCoverage(c,site,owner,fence);
    for(const kind of ['hourly_rollup','daily_rollup','page_centroid','legacy_centroid'] as CacheKind[])await cache.completeOwnerKind(c,site,owner,kind,0,fence);
    // A rolled-back upload is a real CH orphan, not an accepted raw batch.
    await c.query('SAVEPOINT orphan');await publish([event(.25)]);await c.query('ROLLBACK TO SAVEPOINT orphan');
    const late=event(.25,Date.now()-3600000),newPoint=event(.8);
    await publish([late,newPoint]);
    const source=await materializeCanonicalHeatmap(c,pool,site);
    expect((await c.query(`SELECT x,count FROM ${source.relation} ORDER BY x`)).rows).toEqual([{x:25,count:'20'},{x:80,count:'1'}]);
    expect((await c.query('SELECT count(*)::int n FROM heatmap_points')).rows[0].n).toBe(0);
    expect(pool.waitingCount).toBe(0);await source.cleanup();
    const again=await materializeCanonicalHeatmap(c,pool,site);expect((await c.query(`SELECT sum(count)::text n FROM ${again.relation}`)).rows[0].n).toBe('21');await again.cleanup();
    await cache.invalidateSite(c,site);await expect(materializeCanonicalHeatmap(c,pool,site)).rejects.toMatchObject({code:'historical_coverage_unavailable'});
    await c.query('ROLLBACK');
   }finally{
    await c.query('ROLLBACK');await c.query('BEGIN');await raw.deleteSegments(c,site,[{visitorId:visitor}],async()=>{});await cache.invalidateSite(c,site);await c.query('COMMIT');c.release();
   }
  }finally{installCanonicalStore(pool,null);installCacheStore(pool,null);await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
 },30000);
});
