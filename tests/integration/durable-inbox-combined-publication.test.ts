import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {DurableInboxPrototype,type PreparedEventRow} from '../../scripts/prototypes/durable-inbox.js';
import {isolatedTestConnectionString} from '../support/database-url.js';
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};};
/** Actual PG atomicity/gate tests; callbacks simulate transport, not CH ACK. */
describe.skipIf(!process.env.TEST_DATABASE_URL)('combined prototype publication transaction',()=>{
 let admin:Pool,pool:Pool,inbox:DurableInboxPrototype,schema:string;const site='combined-only';
 const event=(visitor='A'):PreparedEventRow=>({event_id:randomUUID(),page_id:randomUUID(),visitor_id:visitor,ts:new Date().toISOString(),type:'pageview',path:'/',payload:{},dimensions:{}});
 beforeEach(async()=>{schema='inbox_proto_'+randomUUID().replaceAll('-','');admin=new Pool({connectionString:isolatedTestConnectionString(),max:2});await admin.query(`CREATE SCHEMA ${schema}`);pool=new Pool({connectionString:isolatedTestConnectionString(),max:4,options:`-c search_path=${schema}`});inbox=new DurableInboxPrototype(pool,{admissionMode:'independent'});await inbox.initialize();await inbox.addSite(site);});
 afterEach(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
 const original=async()=> (await pool.query('SELECT event_id,state,owner,fence::text,attempts,body,digest FROM prototype_inbox_events ORDER BY event_id')).rows;
 it('one client holds validation, claim and publication; exactly fifty and empty tail preserve committed counters',async()=>{
 const rows=Array.from({length:50},()=>event());await inbox.receive(site,rows);let pid:number|undefined;
 expect(await inbox.publishNext(site,async(received,_,context)=>{expect(received).toHaveLength(50);pid=(await context.client.query('SELECT pg_backend_pid() pid')).rows[0].pid;const current=(await context.client.query("SELECT state,owner,attempts FROM prototype_inbox_events")).rows;expect(current.every(r=>r.state==='validated'&&r.owner&&r.attempts===1)).toBe(true);await context.verifyFreshClaim();})).toEqual({validated:50,published:50});expect(pid).toBeTypeOf('number');expect(await inbox.publishNext(site,async()=>{throw Error('empty callback');})).toEqual({validated:0,published:0});expect(await inbox.published(site)).toHaveLength(50);expect(pool.waitingCount).toBe(0);
 });
 it('publisher error preserves durable attempt and lease, then expired lease retries normally',async()=>{
 const failed=new DurableInboxPrototype(pool,{admissionMode:'independent',leaseMs:150});await failed.receive(site,[event()]);const before=await original();await expect(failed.publishNext(site,async()=>{throw Error('controlled transport failure');})).rejects.toMatchObject({code:'publisher_unavailable'});const after=await original();expect(after[0]).toMatchObject({state:'validated',attempts:1,body:before[0].body,digest:before[0].digest});expect(after[0].owner).toBeTypeOf('string');expect(await failed.publishNext(site,async()=>{throw Error('lease must exclude');})).toEqual({validated:0,published:0});await new Promise(r=>setTimeout(r,200));expect(await failed.publishNext(site,async()=>{})).toEqual({validated:0,published:1});
 });
 it('post-transport PG failure hides simulated ACK but commits only validated claim metadata',async()=>{
 const failed=new DurableInboxPrototype(pool,{admissionMode:'independent',leaseMs:150});await failed.receive(site,[event()]);const before=await original();await pool.query("CREATE FUNCTION fail_commit_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state='published' THEN RAISE EXCEPTION 'controlled PG failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_commit_row BEFORE UPDATE ON prototype_inbox_events FOR EACH ROW EXECUTE FUNCTION fail_commit_row()");let simulatedAck=0;
 await expect(failed.publishNext(site,async()=>{simulatedAck++;})).rejects.toMatchObject({code:'inbox_transaction_failed'});expect(simulatedAck).toBe(1);expect((await original())[0]).toMatchObject({state:'validated',attempts:1,body:before[0].body,digest:before[0].digest});expect(await inbox.published(site)).toEqual([]);await pool.query('DROP TRIGGER fail_commit_row ON prototype_inbox_events');await new Promise(r=>setTimeout(r,200));expect(await failed.publishNext(site,async()=>{})).toEqual({validated:0,published:1});
 });
 it('deletion before the combined claim excludes A but preserves B, and source mismatch rejects atomically',async()=>{
 await inbox.receive(site,[event('A'),event('B')]);await inbox.deleteSegments(site,[{visitorId:'A'}]);let visitors:string[]=[];expect(await inbox.publishNext(site,async rows=>{visitors=rows.map(r=>r.visitor_id);})).toEqual({validated:1,published:1});expect(visitors).toEqual(['B']);const fresh=event('C');await inbox.receive(site,[fresh]);await pool.query('UPDATE prototype_inbox_sites SET source_epoch=$1',[randomUUID()]);const before=await original();await expect(inbox.publishNext(site,async()=>{throw Error('must not invoke');})).rejects.toMatchObject({code:'source_fence'});expect(await original()).toEqual(before);
 });
 it('independent admission commits during combined publication; deletion cannot cross its privacy gate',async()=>{
 await inbox.receive(site,[event()]);const entered=deferred(),resume=deferred();const publishing=inbox.publishNext(site,async()=>{entered.resolve();await resume.promise;});await entered.promise;let deleting:Promise<void>|undefined;
 try{await expect(inbox.receive(site,[event('B')])).resolves.toMatchObject({received:1});deleting=inbox.deleteSegments(site,[{visitorId:'A'}]);let waiting=false;for(let i=0;i<100;i++){waiting=Boolean((await admin.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND classid=((hashtextextended($1,0)>>32)&4294967295)::oid AND objid=(hashtextextended($1,0)&4294967295)::oid",[site])).rowCount);if(waiting)break;await new Promise(r=>setTimeout(r,10));}expect(waiting).toBe(true);}finally{resume.resolve();await publishing;await deleting;}expect(await inbox.published(site)).toEqual([]);expect(await inbox.publishNext(site,async()=>{})).toEqual({validated:1,published:1});expect((await inbox.published(site))[0]?.visitor_id).toBe('B');
 });
 it('deadline waits for started publisher settlement, preserves attempt and releases the sole client',async()=>{
 // Dedicated max1 instance proves no nested pool acquisition in combined mode.
 await pool.end();pool=new Pool({connectionString:isolatedTestConnectionString(),max:1,options:`-c search_path=${schema}`});const timed=new DurableInboxPrototype(pool,{admissionMode:'independent',leaseMs:100});await timed.receive(site,[event()]);const before=await original();let aborted=false;
 await expect(timed.publishNext(site,async(_,signal)=>{await new Promise<void>(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve();},{once:true}));})).rejects.toMatchObject({code:'publisher_deadline',status:503});expect(aborted).toBe(true);expect((await original())[0]).toMatchObject({state:'validated',attempts:1,body:before[0].body,digest:before[0].digest});expect(await timed.publishNext(site,async()=>{})).toEqual({validated:0,published:1});expect(pool.waitingCount).toBe(0);expect(pool.idleCount).toBe(pool.totalCount);
 });
 it('uncommitted publication conservatively retains pending capacity until commit',async()=>{
 const limited=new DurableInboxPrototype(pool,{admissionMode:'independent',pendingLimit:1});await limited.receive(site,[event()]);const entered=deferred(),resume=deferred();const publishing=limited.publishNext(site,async()=>{entered.resolve();await resume.promise;});await entered.promise;
 try{await expect(limited.receive(site,[event('B')])).rejects.toMatchObject({code:'pending_backpressure',status:429});}finally{resume.resolve();await publishing;}
 await expect(limited.receive(site,[event('B')])).resolves.toMatchObject({received:1});expect((await pool.query("SELECT count(*)::int n FROM prototype_inbox_events WHERE state IN('received','validated')")).rows[0].n).toBe(1);
 });

 it('one durable failed attempt exhausts maxAttempts without a second provider call',async()=>{
 const limited=new DurableInboxPrototype(pool,{admissionMode:'independent',leaseMs:100,maxAttempts:1});await limited.receive(site,[event()]);let calls=0;
 await expect(limited.publishNext(site,async()=>{calls++;throw Error('controlled failure');})).rejects.toMatchObject({code:'publisher_unavailable'});expect((await original())[0]).toMatchObject({state:'validated',attempts:1});await new Promise(r=>setTimeout(r,150));
 expect(await limited.publishNext(site,async()=>{calls++;})).toEqual({validated:0,published:0});expect(calls).toBe(1);expect((await original())[0]).toMatchObject({state:'failed',attempts:1});expect(await limited.published(site)).toEqual([]);
 });

});
