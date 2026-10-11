import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {DurableInboxPrototype,type PreparedEventRow} from '../../scripts/prototypes/durable-inbox.js';
import {migrate} from '../../src/server/db.js';
import {canonical} from '../../src/server/security.js';
import {isolatedTestConnectionString} from '../support/database-url.js';
async function bounded<T>(promise:Promise<T>){let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('admission did not complete independently')),1500);})]);}finally{if(timer)clearTimeout(timer);}}
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};};
/** Actual PG lock/FK/admission tests. Publisher/eraser callbacks are controlled
 * transport barriers, NOT new CH durability or independent fsync evidence. */
describe.skipIf(!process.env.TEST_DATABASE_URL)('independent research admission gates',()=>{
 let admin:Pool,pool:Pool,schema:string,inbox:DurableInboxPrototype;const site='admission-only';
 const event=(visitor='A'):PreparedEventRow=>({event_id:randomUUID(),page_id:randomUUID(),visitor_id:visitor,ts:'2026-10-11T12:00:00.000Z',type:'pageview',path:'/',payload:{},dimensions:{}});
 const waitLock=async(key:string,salt:number)=>{for(let i=0;i<100;i++){const r=await admin.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND classid=((hashtextextended($1,$2)>>32)&4294967295)::oid AND objid=(hashtextextended($1,$2)&4294967295)::oid",[key,salt]);if(r.rowCount)return;await new Promise(r=>setTimeout(r,10));}throw Error('expected actual advisory waiter');};
 beforeEach(async()=>{schema='inbox_proto_'+randomUUID().replaceAll('-','');admin=new Pool({connectionString:isolatedTestConnectionString(),max:3});await admin.query(`CREATE SCHEMA ${schema}`);pool=new Pool({connectionString:isolatedTestConnectionString(),max:4,application_name:'inbox-admission-'+schema,options:`-c search_path=${schema}`});inbox=new DurableInboxPrototype(pool,{admissionMode:'independent'});await inbox.initialize();await inbox.addSite(site);});
 afterEach(async()=>{await pool?.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
 it('receive commits while publisher holds the real site gate before transport completes',async()=>{
 const a=event(),b=event('B');await inbox.receive(site,[a]);await inbox.validate(site);const claim=await inbox.claim(site),entered=deferred(),resume=deferred();const publishing=inbox.publish(claim,async()=>{entered.resolve();await resume.promise;});
 try{await entered.promise;await expect(bounded(inbox.receive(site,[b]))).resolves.toMatchObject({received:1});expect((await pool.query('SELECT state FROM prototype_inbox_events WHERE event_id=$1',[b.event_id])).rows[0].state).toBe('received');}finally{resume.resolve();await publishing;}expect(await inbox.published(site)).toEqual([a]);
 });
 it('delete holds admission until commit; a queued receiver cannot ACK before negatives are installed',async()=>{
 const a=event();await inbox.receive(site,[a]);const entered=deferred(),resume=deferred();let ack=false;const deleting=inbox.deleteSegments(site,[{visitorId:'A'}],async(_,context)=>{await context.verifyJournalStaged();entered.resolve();await resume.promise;return {physicalAck:true};});await entered.promise;
 const receiving=inbox.receive(site,[event()]).then(()=>{ack=true;return 'accepted';},e=>e.code);
 try{await waitLock(site,762);expect(ack).toBe(false);}finally{resume.resolve();await deleting;}expect(await receiving).toBe('deleted_event');expect(ack).toBe(false);await expect(inbox.receive(site,[a])).rejects.toMatchObject({code:'deleted_event',status:410});
 });
 it('an inserted receiver FK and queued deletion do not invert parent/admission locks',async()=>{
 const barrier=randomUUID(),control=await admin.connect();await control.query('SELECT pg_advisory_lock(hashtextextended($1,763))',[barrier]);await pool.query(`CREATE FUNCTION pause_admission() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('${barrier}',763)); RETURN NEW; END $$; CREATE TRIGGER pause_admission AFTER INSERT ON prototype_inbox_events FOR EACH ROW EXECUTE FUNCTION pause_admission()`);
 const receiving=inbox.receive(site,[event()]);let deleting:Promise<void>|undefined;
 try{await waitLock(barrier,763);deleting=inbox.deleteSegments(site,[{visitorId:'A'}]);await waitLock(site,762);}finally{await control.query('SELECT pg_advisory_unlock(hashtextextended($1,763))',[barrier]);control.release();await receiving;await deleting;}
 expect((await pool.query('SELECT state,body_bytes FROM prototype_inbox_events')).rows).toEqual([{state:'deleted',body_bytes:0}]);await expect(inbox.receive(site,[event()])).rejects.toMatchObject({code:'deleted_event'});
 });
 it('concurrent N/N+1 admissions serialize byte capacity without modifying immutable bodies',async()=>{
 const rows=[event('A'),event('B'),event('C')],bytes=Buffer.byteLength(canonical(rows[0]!));const limited=new DurableInboxPrototype(pool,{admissionMode:'independent',pendingBytesLimit:bytes*2});const results=await Promise.allSettled(rows.map(r=>limited.receive(site,[r])));expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(2);expect(results.filter(r=>r.status==='rejected').map(r=>r.status==='rejected'?r.reason.code:null)).toEqual(['pending_bytes_backpressure']);const usage=(await pool.query('SELECT count(*)::int n,sum(body_bytes)::int bytes FROM prototype_inbox_events')).rows[0];expect(usage).toEqual({n:2,bytes:bytes*2});const retained=(await pool.query('SELECT body FROM prototype_inbox_events LIMIT 1')).rows[0].body;await expect(limited.receive(site,[retained])).resolves.toMatchObject({received:0,duplicates:1});
 });
 it('immutable stored mode rejects mismatched methods including reads and replay',async()=>{
 const wrong=new DurableInboxPrototype(pool),row=event();await inbox.receive(site,[row]);await inbox.validate(site);const claim=await inbox.claim(site);let calls=0;
 for(const operation of [()=>wrong.receive(site,[event()]),()=>wrong.validate(site),()=>wrong.claim(site),()=>wrong.published(site),()=>wrong.replayLatestJournal(site),()=>wrong.deleteSegments(site,[{visitorId:'A'}]),()=>wrong.publish(claim,async()=>{calls++;})])await expect(operation()).rejects.toMatchObject({code:'admission_mode_mismatch',status:409});expect(calls).toBe(0);await expect(pool.query("UPDATE prototype_inbox_sites SET admission_mode='site_gate'")).rejects.toThrow('immutable');expect((await pool.query('SELECT state FROM prototype_inbox_events')).rows[0].state).toBe('validated');
 });
 it('publisher rechecks policy before commit instead of trusting its earlier plain parent read',async()=>{
 await inbox.receive(site,[event()]);await inbox.validate(site);const claim=await inbox.claim(site);await expect(inbox.publish(claim,async()=>{await pool.query("UPDATE prototype_inbox_sites SET privacy_mode='daily_salt' WHERE id=$1",[site]);})).rejects.toMatchObject({code:'source_fence'});expect((await pool.query('SELECT state FROM prototype_inbox_events')).rows[0].state).toBe('validated');
 });
 it('schema discovery is per transaction and enforces real visitor and event-time identity negatives',async()=>{
 // First admission sees no production tables. Real migrations later must not
 // leave a permanent cached false negative in this research instance.
 await inbox.receive(site,[event('seed')]);await migrate(pool);
 await pool.query("INSERT INTO tombstones(site_id,visitor_id) VALUES($1,'A')",[site]);
 await expect(inbox.receive(site,[event('A')])).rejects.toMatchObject({code:'deleted_event',status:410});
 await pool.query("INSERT INTO identity_tombstones(site_id,visitor_id,user_id,started_at,ended_at) VALUES($1,'B','derived-identity','2026-10-11T11:00Z','2026-10-11T13:00Z')",[site]);
 await expect(inbox.receive(site,[event('B')])).rejects.toMatchObject({code:'deleted_event',status:410});
 await expect(inbox.receive(site,[{...event('B'),ts:'2026-10-11T13:00:00.000Z'}])).resolves.toMatchObject({received:1});
 expect(Number((await pool.query("SELECT count(*) n FROM prototype_inbox_events WHERE visitor_id='A'")).rows[0].n)).toBe(0);
 });

 it('publisher deadline rolls back and releases gates while unrelated admission commits and retry succeeds',async()=>{
 const timed=new DurableInboxPrototype(pool,{admissionMode:'independent',leaseMs:300}),a=event(),b=event('B');
 await timed.receive(site,[a]);await timed.validate(site);const claim=await timed.claim(site),entered=deferred();
 const publishing=timed.publish(claim,async(_,signal)=>{entered.resolve();await new Promise<void>(resolve=>{if(signal.aborted)resolve();else signal.addEventListener('abort',()=>resolve(),{once:true});});});
 // Attach rejection immediately; deadline cannot become an unhandled rejection.
 const rejected=expect(publishing).rejects.toMatchObject({code:'publisher_deadline',status:503});
 await entered.promise;await expect(bounded(inbox.receive(site,[b]))).resolves.toMatchObject({received:1});await rejected;
 expect((await pool.query('SELECT state FROM prototype_inbox_events WHERE event_id=$1',[a.event_id])).rows[0].state).toBe('validated');
 expect(await inbox.published(site)).toEqual([]);
 expect((await pool.query("SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND pid IN (SELECT pid FROM pg_stat_activity WHERE application_name=$1)",['inbox-admission-'+schema])).rows[0].n).toBe(0);
 // Expired claim is replaced by a fresh owner; same real site gate is usable.
 await inbox.validate(site);const retry=await inbox.claim(site);expect(retry.owner).not.toBe(claim.owner);await inbox.publish(retry,async()=>{});
 expect((await inbox.published(site)).map(r=>r.event_id).sort()).toEqual([a.event_id,b.event_id].sort());expect(pool.waitingCount).toBe(0);expect(pool.idleCount).toBe(pool.totalCount);
 });

});
