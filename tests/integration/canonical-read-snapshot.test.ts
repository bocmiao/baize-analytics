import {randomUUID} from 'node:crypto';
import {Pool,type PoolClient} from 'pg';
import {it,expect} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {beginSiteSnapshot} from '../../src/server/site-snapshot.js';
import {CanonicalClickHouse} from '../../src/server/canonical-clickhouse.js';
import {installCanonicalEventStore,readSiteEvents} from '../../src/server/event-store.js';
import {readFullSiteFacts} from '../../src/server/site-export.js';
it.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('waits for committed deletion before RR and preserves empty authoritative read/export metadata with max-one pool',async()=>{
 const schema='read_gate_'+randomUUID().replaceAll('-',''),site=randomUUID(),epoch=randomUUID();
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:1});
 let blocker:PoolClient|undefined,reader:PoolClient|undefined;
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);
  await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'empty','example.test','salt')",[site]);
  await pool.query("INSERT INTO canonical_event_authority(site_id,epoch,authority,raw_pruned) VALUES($1,$2,'clickhouse',true)",[site,epoch]);
  const store=new CanonicalClickHouse({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'});await store.initialize();installCanonicalEventStore(pool,store);
  blocker=await admin.connect();await blocker.query(`SET search_path TO ${schema}`);await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[site]);
  reader=await pool.connect();const pid=(await reader.query('SELECT pg_backend_pid() pid')).rows[0].pid;const waiting=beginSiteSnapshot(reader,site);
  let observed=false;for(let i=0;i<150;i++){const r=await admin.query("SELECT wait_event FROM pg_stat_activity WHERE pid=$1",[pid]);if(r.rows[0]?.wait_event==='advisory'){observed=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}expect(observed).toBe(true);
  await blocker.query('UPDATE canonical_event_authority SET deletion_epoch=deletion_epoch+1 WHERE site_id=$1',[site]);await blocker.query('COMMIT');await waiting;
  expect((await reader.query('SELECT deletion_epoch::text FROM canonical_event_authority WHERE site_id=$1',[site])).rows[0].deletion_epoch).toBe('1');
  const result=await readSiteEvents(pool,site,{client:reader});expect(result).toMatchObject({events:[],authority:'clickhouse',canonicalEpoch:epoch,deletionEpoch:'1',source:'clickhouse',coverage:1});
  const facts=await readFullSiteFacts(reader,site,false,{pool,canonicalReplayRows:[]});expect(facts.event_data).toEqual([]);expect(facts.export_manifest).toHaveLength(1);
  await reader.query('COMMIT');expect((await reader.query("SELECT count(*)::int n FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory'")).rows[0].n).toBe(0);
  reader.release();reader=undefined;const standalone=await readSiteEvents(pool,site);expect(standalone).toMatchObject({authority:'clickhouse',events:[],deletionEpoch:'1'});
 }finally{
  if(reader){await reader.query('ROLLBACK').catch(()=>{});reader.release();}if(blocker){await blocker.query('ROLLBACK').catch(()=>{});blocker.release();}
  await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
 }
},30000);
