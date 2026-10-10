import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {it,expect} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {claimSite,rebuildSite} from '../../src/server/worker.js';
it.skipIf(!process.env.TEST_DATABASE_URL)('real PG fairly advances every persistently dirty site independent of late event watermarks',async()=>{
 const schema='fair_'+randomUUID().replaceAll('-','');const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});const ids=['a','b','c','d'];
 const intake=async()=>{for(const id of ids){await pool.query("INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload) VALUES($1,$2,$3,$4,$5,'pageview','/fair','{}')",[id,randomUUID(),new Date(Date.now()-(id==='a'?3600000:60000)),id,randomUUID()]);await pool.query('UPDATE aggregation_state SET generation=generation+1 WHERE site_id=$1',[id]);}};
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);for(const id of ids){await pool.query('INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,$1,$1,$1)',[id]);await pool.query('INSERT INTO aggregation_state(site_id) VALUES($1)',[id]);}await intake();
  const claims:string[]=[];for(let round=0;round<8;round++){const claim=await claimSite(pool);expect(claim).not.toBeNull();claims.push(claim!.site_id);expect(await rebuildSite(pool,claim!,{afterSnapshot:intake})).toBe(true);if(round===3)expect((await pool.query('SELECT count(*)::int n FROM aggregation_state WHERE processed_generation>0')).rows[0].n).toBe(4);}
  expect(claims).toEqual([...ids,...ids]);expect((await pool.query('SELECT bool_and(processed_generation>0 AND generation>processed_generation AND last_claimed_at IS NOT NULL AND attempts=0) AS ready FROM aggregation_state')).rows[0].ready).toBe(true);
  const concurrent=(await Promise.all(ids.map(()=>claimSite(pool)))).filter(Boolean);expect(concurrent).toHaveLength(4);expect(new Set(concurrent.map(c=>c!.site_id)).size).toBe(4);
 }finally{await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
},30000);
