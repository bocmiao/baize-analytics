import {Pool} from 'pg';
import Fastify from 'fastify';
import {randomUUID} from 'node:crypto';
import {it,expect} from 'vitest';
import {migrate,transaction} from '../../src/server/db.js';
import {claimSite} from '../../src/server/worker.js';
import {buildSessionFacts} from '../../src/server/session-facts.js';
import {publishSessionFacts} from '../../src/server/session-facts-publication.js';
import {createFactEffectSink} from '../../src/server/fact-provenance.js';
import {streamSiteEventBatches} from '../../src/server/event-store.js';
import {beginGovernanceSiteRead,registerGovernance,hashToken} from '../../src/server/governance.js';
import type {AppContext} from '../../src/server/context.js';

it.skipIf(!process.env.TEST_DATABASE_URL)('real V2 fact publication → native readonly share daily UV; legacy days and salt privacy remain exact with max1',async()=>{
 const schema='sharing_facts_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:1}),app=Fastify();
 try{await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);const ctx={pool,config:{publicUrl:'http://localhost'}} as AppContext;await registerGovernance(app,ctx);const base=await app.listen({host:'127.0.0.1',port:0});
  for(const privacy of ['standard','daily_salt']){const site=randomUUID(),token=randomUUID(),retainedFrom=new Date(Date.now()-10*86400000);await pool.query('INSERT INTO sites(id,name,domain,salt_secret,timezone,privacy_mode) VALUES($1,$2,$3,$4,$5,$6)',[site,'share','example.test','salt','Asia/Kolkata',privacy]);await pool.query('INSERT INTO aggregation_state(site_id,generation) VALUES($1,1)',[site]);const claim=await claimSite(pool);expect(claim?.site_id).toBe(site);
   const dates=(await pool.query("SELECT (current_date-1)::text AS day,(current_date-2)::text AS older,((current_date-1)::timestamp AT TIME ZONE 'Asia/Kolkata') AS start")).rows[0];const start=+new Date(dates.start);for(const [visitor,offset]of [['same',600000],['same',7200000],['other',7800000]] as const)await pool.query("INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions) VALUES($1,$2,$3,$4,$5,'pageview','/real','{}','{}')",[site,randomUUID(),new Date(start+offset),visitor,randomUUID()]);
   const source=await pool.connect();let run:string;try{await beginGovernanceSiteRead(source,site);run=await buildSessionFacts(source,{siteId:site,epoch:claim!.epoch,generation:claim!.generation,outboxHighWatermark:'0'},{timezone:'Asia/Kolkata',privacy:privacy!=='standard',timeoutMs:1800000,goals:[],funnels:[],effects:createFactEffectSink(source,retainedFrom)},(async function*(){for await(const batch of streamSiteEventBatches(pool,site,{client:source}))yield batch.events;})());await source.query('COMMIT');}finally{await source.query('ROLLBACK');source.release();}
   await transaction(pool,c=>publishSessionFacts(c,{run,leaseOwner:claim!.lease_owner,retainedFrom,timezone:'Asia/Kolkata',privacy:privacy!=='standard',goals:[],funnels:[]}));
   expect((await pool.query('SELECT data FROM stats_daily WHERE site_id=$1 AND day=$2',[site,dates.day])).rows[0].data).toMatchObject({relationalVersion:2,visitors:[],pv:3});await pool.query("INSERT INTO stats_daily(site_id,day,data,generation) VALUES($1,$2,'{\"pv\":3,\"visitors\":[\"legacy-a\",\"legacy-b\",\"legacy-c\"]}',0)",[site,dates.older]);await pool.query('INSERT INTO share_links(id,site_id,token_hash) VALUES($1,$2,$3)',[randomUUID(),site,hashToken(token)]);
   const response=await fetch(`${base}/api/v1/shares/${token}`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});expect(response.status).toBe(200);const body=await response.json();expect(body.days).toEqual([{day:dates.older,pv:3,uv:3},{day:dates.day,pv:3,uv:2}]);expect(body.privacy).toBe(privacy==='standard'?'standard':'daily_salt_no_cross_day_uv');expect(JSON.stringify(body)).not.toContain('legacy-a');expect(JSON.stringify(body)).not.toContain('visitor_id');await pool.query('UPDATE share_links SET revoked=true WHERE site_id=$1',[site]);expect((await fetch(`${base}/api/v1/shares/${token}`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status).toBe(404);expect(pool.waitingCount).toBe(0);
  }
 }finally{await app.close();await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
});
