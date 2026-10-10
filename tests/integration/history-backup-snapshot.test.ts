import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {Pool} from 'pg';
import {describe,it,expect} from 'vitest';
import {migrate,lockSite} from '../../src/server/db.js';
import {initializeJournal} from '../../src/server/deletion.js';
import {HistoryStore,captureSiteHistory} from '../../src/server/history-store.js';
import {writeHistoryBackup} from '../../src/server/history-security.js';
describe.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('history backup fresh deletion snapshot',()=>{
 it('waits for an actual deletion gate before RR and refuses to mint stale archived identity',async()=>{
 const schema='history_wait_'+randomUUID().replaceAll('-',''),site=randomUUID(),app='history_wait_'+randomUUID(),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,application_name:app,max:3}),dir=await mkdtemp('/tmp/baize-history-wait-'),store=new HistoryStore({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'});await admin.query(`CREATE SCHEMA ${schema}`);
 try{await migrate(pool);await initializeJournal(dir);await store.initialize();await pool.query("INSERT INTO sites(id,name,domain,salt_secret)VALUES($1,'wait','example.test','secret')",[site]);await pool.query('INSERT INTO aggregation_state(site_id)VALUES($1)',[site]);await pool.query("INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions)VALUES($1,$2,now(),'A',$3,'pageview','/','{}','{}')",[site,randomUUID(),randomUUID()]);const manifest=await captureSiteHistory(pool,store,site),blocker=await pool.connect();try{await blocker.query('BEGIN');await lockSite(blocker,site);await blocker.query("DELETE FROM events WHERE site_id=$1 AND visitor_id='A'",[site]);await blocker.query('UPDATE aggregation_state SET epoch=gen_random_uuid() WHERE site_id=$1',[site]);const result=writeHistoryBackup(pool,store,manifest,dir,Buffer.alloc(32,7)).then(()=>null,error=>error);let waiting=false;for(let i=0;i<100;i++){waiting=Boolean((await admin.query("SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name=$1 AND NOT l.granted) waiting",[app])).rows[0].waiting);if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));}expect(waiting).toBe(true);await blocker.query('COMMIT');expect((await result)?.message).toBe('HISTORY_EPOCH_CHANGED');expect(await readdir(dir)).not.toContain('history-backups');}finally{await blocker.query('ROLLBACK');blocker.release();}
 }finally{await store.eraseSite(site);await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});}
 });
});
