import {fixtureInstallationNonce} from '../helpers/install-fixture.js';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {Pool} from 'pg';
import {it,expect} from 'vitest';
import {createApp} from '../helpers/install-fixture.js';
import {runWorkerOnce} from '../../src/server/worker.js';
import {CanonicalClickHouse,installCanonicalStore} from '../../src/server/canonical-clickhouse.js';
import {ClickHouseSessionHeaderStore,installSessionHeaderStore} from '../../src/server/session-header-store.js';
import {ClickHouseFactStore,installFactStore} from '../../src/server/fact-store.js';
import {queryStats} from '../../src/server/analytics.js';
import {withStatsReadSnapshot} from '../../src/server/stats-read-snapshot.js';
import {isolatedTestConnectionString} from '../support/database-url.js';
it.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('comparison reuses authenticated CH facts on one client and preserves exact oracle and missing-body failure',async()=>{
 const schema='ai_chfacts_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:isolatedTestConnectionString(),max:1,options:`-c search_path=${schema}`}),dir=await mkdtemp('/tmp/baize-ai-chfacts-'),site=randomUUID(),a=randomUUID(),b=randomUUID(),epoch=randomUUID(),day=new Date(Date.now()-86400000).toISOString().slice(0,10),at=Date.parse(day+'T12:00:00Z');
 const config={url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'},canonical=new CanonicalClickHouse(config),headers=new ClickHouseSessionHeaderStore(config),facts=new ClickHouseFactStore(config);let runtime:Awaited<ReturnType<typeof createApp>>|undefined;
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);runtime=await createApp({pool,redis:null,background:false,dataDir:dir,keyDir:dir});await pool.query("INSERT INTO sites(id,name,domain,salt_secret,timezone) VALUES($1,'AI facts','ai-facts.example.invalid','local-test','UTC')",[site]);await pool.query('INSERT INTO aggregation_state(site_id) VALUES($1)',[site]);
  const events=[{visitor_id:a,page_id:randomUUID(),path:'/a'},{visitor_id:a,page_id:randomUUID(),path:'/a'},{visitor_id:b,page_id:randomUUID(),path:'/b'}].map((e,i)=>({...e,event_id:randomUUID(),type:'pageview',ts:at+i*1000,url:'https://ai-facts.example.invalid'+e.path}));const response=await runtime.app.inject({method:'POST',url:'/api/collect',headers:{origin:'https://ai-facts.example.invalid','user-agent':'Mozilla/5.0 Chrome/120'},payload:{protocol_version:1,site_id:site,sdk:'actual-ai-facts',sent_at:Date.now(),events}});expect(response.statusCode,response.body).toBe(202);expect(response.json().accepted).toBe(3);
  await canonical.initialize();await headers.initialize();await facts.initialize();installCanonicalStore(pool,canonical);installSessionHeaderStore(pool,headers);installFactStore(pool,facts);
  // Explicit test publication setup, not production activation or readiness proof.
  const c=await pool.connect();try{await c.query('BEGIN');await c.query("INSERT INTO canonical_event_authority(site_id,epoch,authority) VALUES($1,$2,'clickhouse')",[site,epoch]);const rows=(await c.query('SELECT e.*,k.hash FROM events e JOIN event_keys k USING(site_id,event_id) WHERE e.site_id=$1',[site])).rows;await canonical.publishBatch(c,site,randomUUID(),epoch,rows.map(({hash,...event})=>({event,acceptedHash:hash})));await c.query('COMMIT');}finally{await c.query('ROLLBACK');c.release();}
  expect(await runWorkerOnce(pool)).toBe(true);expect((await pool.query("SELECT count(*)::int n FROM analytics_fact_store_runs WHERE site_id=$1 AND state='complete'",[site])).rows[0].n).toBe(2);
  await pool.query('DELETE FROM analytics_effect_facts e USING analytics_fact_store_runs m WHERE e.run_id=m.run_id AND m.site_id=$1',[site]);await pool.query('DELETE FROM analytics_vital_samples v USING analytics_fact_store_runs m WHERE v.run_id=m.run_id AND m.site_id=$1',[site]);expect((await pool.query('SELECT count(*)::int n FROM analytics_effect_facts')).rows[0].n).toBe(0);
  const from=new Date(at+1000-3600000).toISOString(),mid=new Date(at+1000).toISOString(),to=new Date(at+1000+3600000).toISOString();
  const filters={path:'/a'};
  const oracleCurrent=await queryStats(runtime.ctx,site,mid,to,filters),oraclePrevious=await queryStats(runtime.ctx,site,from,mid,filters);
  const shared=await withStatsReadSnapshot(runtime.ctx,site,from,to,async client=>({current:await queryStats(runtime!.ctx,site,mid,to,filters,{client}),previous:await queryStats(runtime!.ctx,site,from,mid,filters,{client})}));
  expect(shared.dirty).toBe(false);expect(shared.value.current.totals).toEqual(oracleCurrent.totals);expect(shared.value.previous.totals).toEqual(oraclePrevious.totals);
  expect(shared.value.current.watermark).toEqual(oracleCurrent.watermark);expect(shared.value.previous.coverage).toEqual(oraclePrevious.coverage);expect(pool.waitingCount).toBe(0);
  const credentials={email:'comparison@example.test',password:'Comparison-acceptance-2026!',name:'管理员'};
  const setup=await runtime.app.inject({method:'POST',url:'/api/setup',payload:{...credentials,installationNonce:fixtureInstallationNonce}});expect(setup.statusCode,setup.body).toBe(200);
  const login=await runtime.app.inject({method:'POST',url:'/api/login',payload:{email:credentials.email,password:credentials.password}});expect(login.statusCode,login.body).toBe(200);
  const cookie=String(login.headers['set-cookie']).split(';')[0]!;
  const params=new URLSearchParams({from:mid,to,path:filters.path,compare:'previous'});
  const http=await runtime.app.inject({method:'GET',url:`/api/v1/sites/${site}/stats?${params}`,headers:{cookie}});expect(http.statusCode,http.body).toBe(200);
  const body=http.json();expect(body.totals).toEqual(oracleCurrent.totals);expect(body.coverage).toEqual(oracleCurrent.coverage);
  expect(body.comparison).toMatchObject({from,to:mid,totals:oraclePrevious.totals,coverage:oraclePrevious.coverage});expect(pool.waitingCount).toBe(0);
  await expect(withStatsReadSnapshot(runtime.ctx,site,from,to,async client=>{await client.query('UPDATE canonical_event_authority SET deletion_epoch=deletion_epoch+1 WHERE site_id=$1',[site]);return 1;})).rejects.toMatchObject({code:'aggregate_source_changed'});
  await pool.query('UPDATE canonical_event_authority SET deletion_epoch=deletion_epoch-1 WHERE site_id=$1',[site]);
  // Remove actual selected CH backing, retaining its committed receipt: no zero PG fallback.
  const remove=new URL(config.url);remove.searchParams.set('query','ALTER TABLE baize_derived_facts_v1 DELETE WHERE site_id={site:String} SETTINGS mutations_sync=2');remove.searchParams.set('param_site',site);const erased=await fetch(remove,{method:'POST',headers:{'X-ClickHouse-User':config.username,'X-ClickHouse-Key':config.password}});expect(erased.ok).toBe(true);await erased.body?.cancel();await expect(withStatsReadSnapshot(runtime.ctx,site,from,to,client=>queryStats(runtime!.ctx,site,from,to,filters,{client}))).rejects.toMatchObject({code:'aggregate_members_unavailable'});expect(pool.waitingCount).toBe(0);
 }finally{if(runtime){const c=await pool.connect();try{await c.query('BEGIN');await facts.eraseSegments(c,site,[{visitorId:a},{visitorId:b}]);await headers.eraseSegments(c,site,[{visitorId:a},{visitorId:b}]);await canonical.deleteSegments(c,site,[{visitorId:a},{visitorId:b}],async()=>{});await c.query('COMMIT');}finally{await c.query('ROLLBACK');c.release();}}installFactStore(pool,null);installSessionHeaderStore(pool,null);installCanonicalStore(pool,null);await runtime?.app.close();await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});}
},30000);
