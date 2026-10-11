import {it,expect} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {migrate} from '../../src/server/db.js';
import {isolatedTestConnectionString} from '../support/database-url.js';
import {exportedPublishedDefinitions} from '../../src/server/published-export-projections.js';

it.skipIf(!process.env.TEST_DATABASE_URL)('export definitions union current complete owners, deduplicate funnel visitors and reject dirty generations',async()=>{
 const schema='export_defs_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:isolatedTestConnectionString()}),pool=new Pool({connectionString:isolatedTestConnectionString(),options:`-c search_path=${schema},public`,max:1});
 const site='defs-'+randomUUID(),old=randomUUID(),current=randomUUID(),goal=randomUUID(),funnel=randomUUID(),a=randomUUID(),b=randomUUID(),sameVisitor=randomUUID(),retired=randomUUID(),legacy=randomUUID();
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);
  await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'Definitions','defs.example.test','salt')",[site]);
  const epoch=(await pool.query('INSERT INTO aggregation_state(site_id,generation,processed_generation) VALUES($1,2,2) RETURNING epoch',[site])).rows[0].epoch;
  for(const [run,generation]of [[old,1],[current,2]])await pool.query("INSERT INTO analytics_fact_runs(id,site_id,epoch,generation,outbox_high_watermark,status,query_version,retained_from) VALUES($1,$2,$3,$4,0,'published',2,'2026-10-02T00:00:00Z')",[run,site,epoch,generation]);
  await pool.query("INSERT INTO goals(id,site_id,name,type,config) VALUES($1,$2,'Conversion','event','{}')",[goal,site]);await pool.query("INSERT INTO funnels(id,site_id,name,steps) VALUES($1,$2,'Journey','[{\"type\":\"page\",\"value\":\"/entry\"},{\"type\":\"event\",\"value\":\"signup\"}]')",[funnel,site]);
  const emit=async(run:string,session:string,visitor:string,n=1,ts='2026-10-02T10:00:00Z')=>{for(const [metric,key,member]of [['sessions',[],false],['goal',[goal],false],['goalAttribution',[JSON.stringify({goalId:goal,channel:'search'})],false],['funnel',[funnel,'0'],true],['funnel',[funnel,'1'],true]] as [string,string[],boolean][]){await pool.query("INSERT INTO analytics_effect_facts VALUES($1,$2,$3,$4,$5,'/entry','{}',$6,$7,$8,$9)",[run,randomUUID(),ts,session,visitor,metric,JSON.stringify(key),n,member]);}};
  await emit(old,a,'visitor-a');await emit(old,b,'visitor-b',999);await emit(current,b,'visitor-b');await emit(current,sameVisitor,'visitor-a');await emit(old,retired,'retired-visitor',999);await emit(old,legacy,'legacy-visitor',1,'2026-10-01T23:10:00Z');
  for(const [session,visitor,run]of [[a,'visitor-a',old],[b,'visitor-b',current],[sameVisitor,'visitor-a',current],[retired,'retired-visitor',current]])await pool.query('INSERT INTO analytics_session_contribution_heads VALUES($1,$2,$3,$4,$5,$6)',[site,session,visitor,run,epoch,run===old?1:2]);
  await pool.query("INSERT INTO analytics_relational_buckets VALUES($1,'2026-10-01T23:00:00Z',$2,$3,1)",[site,old,epoch]);
  const c=await pool.connect();try{const result=await exportedPublishedDefinitions(c,site);expect(result).toHaveLength(1);expect(result[0].generation).toBe('2');expect(result[0].data.goals).toEqual([{id:goal,name:'Conversion',conversions:4,rate:1,channels:{search:4}}]);expect(result[0].data.funnels).toEqual([{id:funnel,name:'Journey',steps:[3,3],dropoff:[0,0],rate:1}]);
   await c.query('UPDATE aggregation_state SET generation=3 WHERE site_id=$1',[site]);await expect(exportedPublishedDefinitions(c,site)).rejects.toThrow('EXPORT_AGGREGATION_PENDING');
  }finally{c.release();}
 }finally{await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
},60000);
