import {Pool} from 'pg';
import Fastify from 'fastify';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {describe,it,expect} from 'vitest';
import {isolatedTestConnectionString} from '../support/database-url.js';
import {migrate,beginPartitionSnapshot} from '../../src/server/db.js';
import {registerCollect} from '../../src/server/collect.js';
import {deleteVisitor,replayDeletionJournal} from '../../src/server/deletion.js';
import {readFullSiteFacts} from '../../src/server/site-export.js';
import type {AppContext} from '../../src/server/context.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)('legacy goal/funnel notification privacy: actual collection/delete/journal/export',()=>{
 it('physically erases private snapshots while preserving ordinary jobs and other sites; restored old rows are not exported',async()=>{
  const schema='notificationprivacy_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:isolatedTestConnectionString(),options:`-c search_path=${schema},public`,max:1}),app=Fastify(),site='privacy-'+randomUUID(),other='privacy-'+randomUUID(),visitor=randomUUID(),dir=await mkdtemp('/tmp/baize-notification-privacy-');
  const ctx:AppContext={pool,redis:null,config:{dataDir:dir,masterKey:randomBytes(32),publicUrl:'http://localhost'},user:async()=>{throw Error('not used');},authorize:async()=>{throw Error('not used');},audit:async()=>{}};
  try{await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);for(const id of [site,other])await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'privacy','privacy.example.invalid','local-salt')",[id]);await registerCollect(app,ctx);const collected=await app.inject({method:'POST',url:'/api/collect',headers:{origin:'https://privacy.example.invalid','user-agent':'Mozilla/5.0 Firefox/120'},payload:{protocol_version:1,site_id:site,sdk:'actual-derived-privacy',sent_at:Date.now(),events:[{event_id:randomUUID(),visitor_id:visitor,page_id:randomUUID(),type:'pageview',ts:Date.now()-1000,url:'https://privacy.example.invalid/private-label',path:'/private-label'}]}});expect(collected.statusCode,collected.body).toBe(202);const epoch=(await pool.query('SELECT epoch::text FROM aggregation_state WHERE site_id=$1',[site])).rows[0].epoch,ids: string[]=[],oldBodies:Record<string,unknown>[]=[];
   // These are deliberate pre-existing database snapshot fixtures, not mocked
   // claims that the real goal/funnel trigger generated these old notifications.
   for(const kind of ['goal','funnel']){const id=randomUUID(),body={kind,aggregationEpoch:epoch,privateLabel:'OLD-PRIVATE-'+kind,current:42,previous:7};ids.push(id);oldBodies.push(body);await pool.query("INSERT INTO notification_jobs(id,site_id,body,dedupe_key,status) VALUES($1,$2,$3,$4,'complete')",[id,site,body,'alert:'+id]);}
   const ordinary=randomUUID(),otherJob=randomUUID();await pool.query("INSERT INTO notification_jobs(id,site_id,body,dedupe_key,status) VALUES($1,$2,$3,$4,'complete')",[ordinary,site,{kind:'account-notice',message:'ordinary'},'account:'+ordinary]);await pool.query("INSERT INTO notification_jobs(id,site_id,body,dedupe_key,status) VALUES($1,$2,$3,$4,'complete')",[otherJob,other,{kind:'funnel',privateLabel:'OTHER-SITE'},'alert:'+otherJob]);await deleteVisitor(ctx,site,{visitor_id:visitor},null);
   for(const id of ids){const row=(await pool.query('SELECT body,status FROM notification_jobs WHERE id=$1',[id])).rows[0];expect(row.status).toBe('revoked');expect(row.body).toEqual({invalidated:true,reason:'site-derived-privacy-invalidation'});}expect((await pool.query('SELECT body FROM notification_jobs WHERE id=$1',[ordinary])).rows[0].body.message).toBe('ordinary');expect((await pool.query('SELECT body FROM notification_jobs WHERE id=$1',[otherJob])).rows[0].body.privateLabel).toBe('OTHER-SITE');
   for(let i=0;i<ids.length;i++)await pool.query("UPDATE notification_jobs SET body=$2,status='complete' WHERE id=$1",[ids[i],oldBodies[i]]);
   const c=await pool.connect();try{await beginPartitionSnapshot(c);const facts=await readFullSiteFacts(c,site,false,{pool});expect(JSON.stringify(facts.notification_jobs)).not.toContain('OLD-PRIVATE');expect(facts.notification_jobs).toHaveLength(1);await c.query('COMMIT');}finally{c.release();}
   await replayDeletionJournal(pool,dir);for(const id of ids)expect((await pool.query('SELECT body FROM notification_jobs WHERE id=$1',[id])).rows[0].body).toEqual({invalidated:true,reason:'site-derived-privacy-invalidation'});expect(pool.waitingCount).toBe(0);
  }finally{await app.close();await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});}
 });
});
