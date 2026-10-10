import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {describe,it,expect} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {stageSessionCarry,stageCarryKey,publishSessionCarry,readSessionCarry,streamCarryKeys,type CarryCheckpoint} from '../../src/server/session-carry.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)('036 staged session carry persistence, not yet a production reducer',()=>{
 it('keeps unpublished state invisible, streams exact keys, and isolates session contribution ownership',async()=>{
  const schema=`carry_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:1}),site=randomUUID();await admin.query(`CREATE SCHEMA ${schema}`);
  try{await migrate(pool);await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'carry','example.test','test')",[site]);await pool.query('INSERT INTO aggregation_state(site_id,generation,processed_generation) VALUES($1,1,1)',[site]);const epoch=(await pool.query('SELECT epoch FROM aggregation_state WHERE site_id=$1',[site])).rows[0].epoch;
   const run=randomUUID(),sessionA=randomUUID(),sessionB=randomUUID(),client=await pool.connect();
   try{await client.query('BEGIN');await client.query("INSERT INTO analytics_fact_runs(id,site_id,epoch,generation,outbox_high_watermark,status) VALUES($1,$2,$3,1,0,'staging')",[run,site,epoch]);
    const checkpoint:CarryCheckpoint={visitorId:'A',sessionId:sessionA,anchorEventId:randomUUID(),through:'2026-10-01T00:00:00.000Z',lastEventId:randomUUID(),privacyMode:'standard',localDay:'2026-10-01',definitionsHash:'defs',state:{startedAt:'2026-07-01T00:00:00.000Z',lastActive:'2026-10-01T00:00:00.000Z',entryPath:'/old-entry',exitPath:'/later',pageviews:100000,visibleMs:50000000,entryDimensions:{channel:'search'}},status:'valid'};
    await stageSessionCarry(client,site,run,checkpoint);expect(await readSessionCarry(client,site,'A','standard','2026-10-01','defs')).toBeNull();
    for(let i=0;i<203;i++)await stageCarryKey(client,run,'A',{kind:'heartbeat',key:`interval-${i}`,state:{start:i*1000,end:i*1000+500,visibleMs:500},first:'2026-09-01T00:00:00Z',last:'2026-09-01T00:00:01Z'});
    await stageCarryKey(client,run,'A',{kind:'heartbeat',key:'interval-0',state:{start:0,end:500,visibleMs:500},first:'2026-09-01T00:00:00Z',last:'2026-09-01T00:00:01Z'});
    await client.query('INSERT INTO analytics_session_facts VALUES($1,$2,$3,$4),($1,$5,$6,$4)',[run,sessionA,'A',{},sessionB,'B']);await client.query("UPDATE analytics_fact_runs SET status='published' WHERE id=$1",[run]);await publishSessionCarry(client,site,run);
    expect((await readSessionCarry(client,site,'A','standard','2026-10-01','defs'))?.state.pageviews).toBe(100000);expect((await readSessionCarry(client,site,'A','standard','2026-10-01','changed-defs'))?.status).toBe('unavailable');
    let count=0;for await(const keys of streamCarryKeys(client,run,'A')){expect(keys.length).toBeLessThanOrEqual(100);count+=keys.length;}expect(count).toBe(203);
    const next=randomUUID();await client.query("INSERT INTO analytics_fact_runs(id,site_id,epoch,generation,outbox_high_watermark,status) VALUES($1,$2,$3,2,0,'staging')",[next,site,epoch]);await stageSessionCarry(client,site,next,{...checkpoint,state:{...checkpoint.state,pageviews:100001}});await client.query('INSERT INTO analytics_session_facts VALUES($1,$2,$3,$4)',[next,sessionA,'A',{}]);await client.query("UPDATE analytics_fact_runs SET status='published' WHERE id=$1",[next]);await client.query('UPDATE aggregation_state SET generation=2,processed_generation=2 WHERE site_id=$1',[site]);await publishSessionCarry(client,site,next);
    expect((await client.query('SELECT run_id FROM analytics_session_contribution_heads WHERE site_id=$1 AND session_id=$2',[site,sessionA])).rows[0].run_id).toBe(next);expect((await client.query('SELECT run_id FROM analytics_session_contribution_heads WHERE site_id=$1 AND session_id=$2',[site,sessionB])).rows[0].run_id).toBe(run);
    await client.query('UPDATE aggregation_state SET epoch=gen_random_uuid() WHERE site_id=$1',[site]);expect(await readSessionCarry(client,site,'A','standard','2026-10-01','defs')).toBeNull();expect(pool.waitingCount).toBe(0);await client.query('ROLLBACK');
   }finally{await client.query('ROLLBACK');client.release();}
  }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
 });
});
