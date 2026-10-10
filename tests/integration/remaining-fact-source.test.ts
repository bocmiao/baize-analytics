import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {describe,it,expect} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {stageSessionEventHeaders} from '../../src/server/session-event-headers.js';
import {stageSessionCarry,stageCarryKey} from '../../src/server/session-carry.js';
import {ClickHouseRemainingFactStore,installRemainingFactStore} from '../../src/server/remaining-fact-store.js';
import {publishRemainingFactBodies} from '../../src/server/remaining-fact-publication.js';
import {prepareRemainingFactReadSource,withRemainingFactReadSource} from '../../src/server/remaining-fact-source.js';
import {factReadSql,factReadRelations,hasFactReadSource} from '../../src/server/fact-read-context.js';

describe.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('remaining five-body bounded consumer actual PG CH',()=>{
 it('reads CH-only bodies including owned carry after PG pruning, merges explicit legacy PG and refuses a missing sealed checkpoint',async()=>{
  const schema='remaining_source_'+randomUUID().replaceAll('-',''),site=randomUUID(),epoch=randomUUID(),run=randomUUID(),legacy=randomUUID(),session=randomUUID(),oldSession=randomUUID();
  const pageless=randomUUID();
  const from='2026-01-01T00:00:00.000Z',to='2026-01-01T00:00:09.000Z';
  const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,options:`-c search_path=${schema}`}),store=new ClickHouseRemainingFactStore({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'});
  await admin.query(`CREATE SCHEMA ${schema}`);
  try{
   await migrate(pool);await store.initialize();installRemainingFactStore(pool,store);await pool.query("INSERT INTO sites(id,name,domain,salt_secret)VALUES($1,'remaining','example.test','producer-test')",[site]);await pool.query('INSERT INTO aggregation_state(site_id,epoch,generation,processed_generation)VALUES($1,$2,2,2)',[site,epoch]);
   const c=await pool.connect();try{
    await c.query('BEGIN');for(const id of[run,legacy])await c.query("INSERT INTO analytics_fact_runs(id,site_id,epoch,generation,outbox_high_watermark,status,query_version,retained_from)VALUES($1,$2,$3,$4,0,'ready',$5,'2026-01-01')",[id,site,epoch,id===run?2:1,id===run?2:1]);
    function data(id:string,visitor:string){return {id,visitor_id:visitor,started_at:from,last_active:to,entry_path:'/first',exit_path:'/last',pageviews:2,duration_s:9,visible_ms:2000,bounced:false,dimensions:{device:'desktop'}};}
    await c.query('INSERT INTO analytics_session_facts VALUES($1,$2,$3,$4)',[run,session,'CH-owned',data(session,'CH-owned')]);await c.query('INSERT INTO analytics_session_facts VALUES($1,$2,$3,$4)',[legacy,oldSession,'PG-legacy',data(oldSession,'PG-legacy')]);
    await c.query("INSERT INTO analytics_numeric_facts SELECT $1,'hourly',$2,$3,'pv',jsonb_build_array('sample',n,true,null),1 FROM generate_series(1,205)n",[run,from,session]);await c.query("INSERT INTO analytics_numeric_facts VALUES($1,'hourly',$2,$3,'pv','[]',7)",[legacy,from,oldSession]);
    await stageSessionEventHeaders(c,site,legacy,[{sessionId:pageless,event:{site_id:site,event_id:randomUUID(),visitor_id:'PG-legacy',page_id:randomUUID(),ts:from,type:'replay',path:'/replay-only',payload:{},dimensions:{}}}]);await c.query("INSERT INTO analytics_numeric_facts VALUES($1,'hourly',$2,$3,'event','[\"replay-only\"]',5)",[legacy,from,pageless]);
    await c.query("INSERT INTO analytics_member_facts VALUES($1,'daily','2026-01-01',$2,'visitors','[]','CH-owned')",[run,session]);await c.query("INSERT INTO analytics_member_facts VALUES($1,'daily','2026-01-01',$2,'visitors','[]','PG-legacy')",[legacy,oldSession]);
    await stageSessionCarry(c,site,run,{visitorId:'CH-owned',sessionId:session,anchorEventId:randomUUID(),through:to,lastEventId:randomUUID(),privacyMode:'standard',localDay:'2026-01-01',definitionsHash:'definitions',state:{startedAt:from,lastActive:to,entryPath:'/first',exitPath:'/last',pageviews:2,visibleMs:2000,entryDimensions:{device:'desktop'}},status:'valid'});
    await stageCarryKey(c,run,'CH-owned',{kind:'page',key:'first-instance',state:{count:1},first:from,last:to});
    await publishRemainingFactBodies(c,store,site,run,{expectedAggregationEpoch:epoch,verifyLiveFence:async()=>{expect((await c.query('SELECT epoch FROM aggregation_state WHERE site_id=$1',[site])).rows[0].epoch).toBe(epoch);}});
    await c.query("UPDATE analytics_fact_runs SET status='published' WHERE site_id=$1",[site]);await c.query('INSERT INTO analytics_carry_heads VALUES($1,$2,$3,$4,2)',[site,'CH-owned',run,epoch]);await c.query('INSERT INTO analytics_session_contribution_heads VALUES($1,$2,$3,$4,$5,1)',[site,oldSession,'PG-legacy',legacy,epoch]);
    for(const table of['analytics_carry_keys','analytics_carry_checkpoints','analytics_session_facts','analytics_numeric_facts','analytics_member_facts'])await c.query(`DELETE FROM ${table} WHERE run_id=$1`,[run]);
    expect((await c.query('SELECT count(*)::int n FROM analytics_carry_heads WHERE run_id=$1',[run])).rows[0].n).toBe(1);
    await withRemainingFactReadSource(c,pool,site,async source=>{
     expect(source.source).toBe('hybrid');expect((await c.query(`SELECT count(*)::int n FROM ${source.sessionsRelation}`)).rows[0].n).toBe(2);
     expect((await c.query(factReadSql(c,'SELECT sum(value)::int n FROM analytics_numeric_facts'))).rows[0].n).toBe(217);
     expect((await c.query(`SELECT count(DISTINCT visitor_id)::int n FROM ${source.membersRelation}`)).rows[0].n).toBe(2);
     expect((await c.query(`SELECT state FROM ${source.carryCheckpointsRelation}`)).rows[0].state.pageviews).toBe(2);expect((await c.query(`SELECT state FROM ${source.carryKeysRelation}`)).rows[0].state).toEqual({count:1});
     const current=factReadRelations(c).carryCheckpointsRelation;await withRemainingFactReadSource(c,pool,site,async nested=>expect(nested.carryCheckpointsRelation).toBe(current));expect(factReadRelations(c).carryCheckpointsRelation).toBe(current);
    });expect(hasFactReadSource(c)).toBe(false);expect(pool.waitingCount).toBe(0);
    await c.query("INSERT INTO canonical_event_authority(site_id,authority,epoch,body_mode)VALUES($1,'postgres',$2,'strict')",[site,randomUUID()]);
    await expect(prepareRemainingFactReadSource(c,pool,site)).rejects.toThrow('REMAINING_FACT_SOURCE_NOT_MIGRATED');
    await c.query("UPDATE canonical_event_authority SET body_mode='transition' WHERE site_id=$1",[site]);
    await c.query("INSERT INTO identity_tombstones(site_id,visitor_id,user_id,started_at,ended_at)VALUES($1,'CH-owned','A','2026-01-01','2026-01-01T00:00:01Z')",[site]);
    const filtered=await prepareRemainingFactReadSource(c,pool,site);expect((await c.query(`SELECT visitor_id FROM ${filtered.sessionsRelation}`)).rows.map(r=>r.visitor_id)).toEqual(['PG-legacy']);expect((await c.query(`SELECT value FROM ${filtered.numericsRelation}`)).rows.map(r=>r.value)).toEqual(expect.arrayContaining([7,5]));await filtered.cleanup();
    const removal=new URL(process.env.CLICKHOUSE_TEST_URL!);removal.searchParams.set('query',"ALTER TABLE baize_remaining_facts_v1 DELETE WHERE site_id={site:String} AND kind='carry_checkpoints' SETTINGS mutations_sync=2");removal.searchParams.set('param_site',site);const response=await fetch(removal,{method:'POST',headers:{'X-ClickHouse-User':'baize','X-ClickHouse-Key':'local-test-only'}});expect(response.ok).toBe(true);await response.body?.cancel();
    await expect(prepareRemainingFactReadSource(c,pool,site)).rejects.toThrow('REMAINING_FACT_BODY_UNAVAILABLE');expect(hasFactReadSource(c)).toBe(false);await c.query('ROLLBACK');
   }finally{await c.query('ROLLBACK');await c.query('BEGIN');await store.eraseSegments(c,site,[{visitorId:'CH-owned'}]);await c.query('COMMIT');c.release();}
  }finally{installRemainingFactStore(pool,null);await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
 },30000);
});
