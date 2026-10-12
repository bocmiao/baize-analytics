import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {Pool} from 'pg';
import {it,expect} from 'vitest';
import {createApp,fixtureInstallationNonce} from '../helpers/install-fixture.js';
import {runWorkerOnce} from '../../src/server/worker.js';
import {dateRange,previousDateRange} from '../../src/web/time.js';
it.skipIf(!process.env.TEST_DATABASE_URL).each([
 ['2018-11-04','America/Sao_Paulo',23],['2018-10-26','Asia/Amman',25]
] as const)('real PG HTTP civil range %s %s excludes adjacent days across midnight transition',async(day,timezone,hours)=>{
 const schema='civil_http_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`}),dir=await mkdtemp('/tmp/baize-civil-http-');let runtime:Awaited<ReturnType<typeof createApp>>|undefined;
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);runtime=await createApp({pool,redis:null,background:false,dataDir:dir,keyDir:dir+'/keys',masterKey:randomBytes(32),publicUrl:'http://127.0.0.1'});const origin=await runtime.app.listen({host:'127.0.0.1',port:0});runtime.ctx.config.publicUrl=origin;
  const setup=await fetch(origin+'/api/setup',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({installationNonce:fixtureInstallationNonce,email:'civil@example.invalid',password:'CivilBoundaryFixture2026!'})});expect(setup.status).toBe(200);const cookie=setup.headers.get('set-cookie')!.split(';')[0]!;
  const created=await fetch(origin+'/api/v1/sites',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({name:'Civil boundary',domain:'civil.example.test',timezone,retention_days:3650})});expect(created.status).toBe(201);const site=(await created.json()).site.id;
  const query=new URLSearchParams(dateRange(day,day,timezone)),start=Date.parse(query.get('from')!),end=Date.parse(query.get('to')!);expect((end-start)/3600000).toBe(hours);
  for(const [ts,path] of [[start-1,'/previous'],[start,'/start'],[end-1,'/last'],[end,'/next']] as const)await pool.query("INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions) VALUES($1,$2,$3,$4,$5,'pageview',$6,'{}','{}')",[site,randomUUID(),new Date(ts),randomUUID(),randomUUID(),path]);
  await pool.query('UPDATE aggregation_state SET generation=generation+1 WHERE site_id=$1',[site]);
  expect(await runWorkerOnce(pool)).toBe(true);
  const response=await fetch(origin+`/api/v1/sites/${site}/stats?${query}`,{headers:{cookie}});expect(response.status,await response.clone().text()).toBe(200);const stats=await response.json();expect(stats.coverage).toBe(1);expect(stats.totals).toMatchObject({pv:2,uv:2});expect(stats.pages.map((p:{path:string})=>p.path).sort()).toEqual(['/last','/start']);
  const previous=await fetch(origin+`/api/v1/sites/${site}/stats?${previousDateRange(query.toString(),timezone)}`,{headers:{cookie}});expect(previous.status).toBe(200);const prior=await previous.json();expect(prior.coverage).toBe(1);expect(prior.totals.pv).toBe(1);expect(prior.pages.map((p:{path:string})=>p.path)).toEqual(['/previous']);
 }finally{await runtime?.app.close();await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});}
});
