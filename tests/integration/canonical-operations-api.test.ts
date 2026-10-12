import {fixtureInstallationNonce} from '../helpers/install-fixture.js';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {createApp} from '../helpers/install-fixture.js';
import {CanonicalClickHouse} from '../../src/server/canonical-clickhouse.js';
import {CANONICAL_ACTIVATION_READY} from '../../src/server/canonical-migration.js';
import {isolatedTestConnectionString} from '../support/database-url.js';

describe.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('explicit canonical operator API real PG/CH max1',()=>{
 const schema='canonical_api_'+randomUUID().replaceAll('-','');
 const admin=new Pool({connectionString:isolatedTestConnectionString()}),pool=new Pool({connectionString:isolatedTestConnectionString(),options:`-c search_path=${schema}`,max:1,connectionTimeoutMillis:3000});
 const store=new CanonicalClickHouse({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'});
 let dir:string,runtime:Awaited<ReturnType<typeof createApp>>,cookie:string,site:string,eventId:string;
 beforeAll(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);dir=await mkdtemp('/tmp/baize-canonical-api-');runtime=await createApp({pool,redis:null,dataDir:dir,keyDir:dir+'/keys',masterKey:Buffer.alloc(32),background:false,clickhouse:null,canonical:store,history:null});const setup=await runtime.app.inject({method:'POST',url:'/api/setup',payload:{installationNonce:fixtureInstallationNonce,email:'canonical@example.test',name:'Operator',password:'Strong-password-123!'}});expect(setup.statusCode).toBe(200);cookie=String(setup.headers['set-cookie']).split(';')[0]!;const created=await runtime.app.inject({method:'POST',url:'/api/v1/sites',headers:{cookie},payload:{name:'canonical',domain:'example.test',timezone:'UTC'}});expect(created.statusCode).toBe(201);site=created.json().site.id;eventId=randomUUID();expect((await runtime.app.inject({method:'POST',url:'/api/collect',headers:{origin:'https://example.test','user-agent':'Mozilla/5.0 Chrome/145.0.0.0'},payload:{protocol_version:1,site_id:site,sdk:'operator-test',sent_at:Date.now(),events:[{event_id:eventId,page_id:randomUUID(),visitor_id:randomUUID(),type:'pageview',ts:Date.now()-1000,url:'https://example.test/real',path:'/real'}]}})).statusCode).toBe(202);});
 afterAll(async()=>{if(site&&eventId)await store.eraseEventID(site,eventId);await runtime?.app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();if(dir)await rm(dir,{recursive:true,force:true});});
 it('requires admin and strict explicit action, preserves PG body when accepted intake makes cutover validation stale',async()=>{
  const url=`/api/v1/sites/${site}/canonical`,send=(action:string)=>runtime.app.inject({method:'POST',url,headers:{cookie},payload:{action}});
  expect((await runtime.app.inject({url})).statusCode).toBe(401);
  expect((await send('unknown')).statusCode).toBe(400);
  expect((await runtime.app.inject({method:'POST',url,payload:{action:'prune'}})).statusCode).toBe(401);
  await pool.query('UPDATE users SET is_admin=false');await pool.query("UPDATE site_members SET role='viewer' WHERE site_id=$1",[site]);expect((await send('prune')).statusCode).toBe(403);await pool.query('UPDATE users SET is_admin=true');await pool.query("UPDATE site_members SET role='owner' WHERE site_id=$1",[site]);
  expect((await runtime.app.inject({method:'POST',url,headers:{cookie},payload:{action:'prune',backupDirectory:'/client-chosen-path',proof:{verified:true}}})).statusCode).toBe(400);
  expect((await send('shadow')).json()).toMatchObject({copied:1});
  expect((await send('shadow')).json()).toMatchObject({remaining:false,copied:0});
  const verified=await send('verify');expect(verified.statusCode,verified.body).toBe(200);expect(verified.json().verified).toBe(1);
  // A real accepted write after verification must invalidate cutover; no forged authority metadata.
  expect((await runtime.app.inject({method:'POST',url:'/api/collect',headers:{origin:'https://example.test','user-agent':'Mozilla/5.0 Chrome/145.0.0.0'},payload:{protocol_version:1,site_id:site,sdk:'operator-test',sent_at:Date.now(),events:[{event_id:randomUUID(),page_id:randomUUID(),visitor_id:randomUUID(),type:'pageview',ts:Date.now(),url:'https://example.test/new',path:'/new'}]}})).statusCode).toBe(202);
  const denied=await send('activate');expect(denied.statusCode,denied.body).toBe(409);expect(denied.json().error).toBe(CANONICAL_ACTIVATION_READY?'canonical_validation_stale':'canonical_integration_not_ready');
  const pruneDenied=await send('prune');expect(pruneDenied.statusCode,pruneDenied.body).toBe(409);expect(pruneDenied.json().error).toBe('canonical_backup_required');
  const state=await runtime.app.inject({url,headers:{cookie}});expect(state.json()).toMatchObject({activationReady:CANONICAL_ACTIVATION_READY,state:{authority:'postgres',phase:'validated'}});
  expect((await pool.query('SELECT count(*)::int AS n FROM events WHERE site_id=$1',[site])).rows[0].n).toBe(2);
  expect((await pool.query("SELECT action FROM audit_logs WHERE site_id=$1 AND action LIKE 'canonical.%' ORDER BY created_at",[site])).rows.map(row=>row.action)).toEqual(['canonical.shadow','canonical.shadow','canonical.verify']);
  expect(pool.waitingCount).toBe(0);
 });
});
