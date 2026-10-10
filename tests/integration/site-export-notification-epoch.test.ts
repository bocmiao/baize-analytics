import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {describe,it,beforeAll,afterAll,expect} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {readFullSiteFacts} from '../../src/server/site-export.js';
describe.skipIf(!process.env.TEST_DATABASE_URL)('site facts export notification epoch fence',()=>{
 const schema='exportnotify_'+randomUUID().replaceAll('-',''),site=randomUUID(),other=randomUUID(),channel=randomUUID(),epoch=randomUUID();
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:1});
 beforeAll(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);for(const id of [site,other])await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'notification','example.test','salt')",[id]);await pool.query('INSERT INTO aggregation_state(site_id,epoch) VALUES($1,$2)',[site,epoch]);await pool.query("INSERT INTO notification_channels(id,site_id,kind,encrypted_config) VALUES($1,$2,'webhook','{}')",[channel,site]);});
 afterAll(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
 it('exports only current derived evidence and preserves nonanalytics notifications in max-one client',async()=>{
  const inputs:{key:string;body:Record<string,unknown>;status?:string}[]=[{key:'old-alert',body:{kind:'traffic',current:99,mean:88}}, {key:'old-bound',body:{kind:'traffic',aggregationEpoch:randomUUID(),current:99}}, {key:'new-bound',body:{kind:'traffic',aggregationEpoch:epoch,current:3,mean:2}}, {key:'restored-cancelled',status:'cancelled',body:{kind:'traffic',aggregationEpoch:randomUUID(),prose:'OLD PRIVATE PROSE'}}, {key:'report:old',body:{aggregationEpoch:randomUUID(),rows:['OLD PRIVATE REPORT']}}, {key:'report:new',body:{aggregationEpoch:epoch,rows:['current report']}}, {key:'revoked-current',status:'revoked',body:{kind:'traffic',aggregationEpoch:epoch,current:123}}, {key:'ordinary',body:{kind:'offline',message:'authorized nonanalytics'}}];
  for(const kind of ['goal','funnel'])inputs.push({key:kind+'-unbound',body:{kind,current:99}}, {key:kind+'-old',body:{kind,aggregationEpoch:randomUUID(),current:99}}, {key:kind+'-valid',body:{kind,aggregationEpoch:epoch,current:1}}, {key:kind+'-invalidated',body:{kind,aggregationEpoch:epoch,invalidated:true,current:99}}, {key:kind+'-revoked',status:'revoked',body:{kind,aggregationEpoch:epoch,current:99}});
  for(const input of inputs)await pool.query('INSERT INTO notification_jobs(id,site_id,channel_id,body,dedupe_key,status) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),site,channel,input.body,input.key,input.status??'pending']);
  const c=await pool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');const facts=await readFullSiteFacts(c,site,false,{pool});expect(facts.notification_jobs.map(r=>r.dedupe_key).sort()).toEqual(['funnel-valid','goal-valid','new-bound','ordinary','report:new']);const serialized=JSON.stringify(facts);expect(serialized).not.toContain('OLD PRIVATE');expect(facts.notification_jobs.find(r=>r.dedupe_key==='new-bound')?.body).toMatchObject({current:3,mean:2});await c.query('COMMIT');}finally{c.release();}
 });
});
