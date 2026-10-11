import {randomUUID} from 'node:crypto';
import {Pool,type PoolClient} from 'pg';
import {expect,it} from 'vitest';
import {isolatedTestConnectionString} from '../support/database-url.js';
import {lookupSessionPagePaths} from '../../src/server/session-page-paths.js';

interface Lookup {visitor_id:string;component:number;page_id:string|null;ts:string;event_id:string}
const uuid=(n:number)=>`00000000-0000-7000-8000-${String(n).padStart(12,'0')}`;
async function scalar(c:PoolClient,table:string,row:Lookup){return (await c.query(`SELECT path FROM ${table} WHERE visitor_id=$1 AND component=$2 AND page_id=$3 AND type='pageview' AND (ts<$4 OR(ts=$4 AND event_id<=$5)) ORDER BY ts DESC,event_id DESC LIMIT 1`,[row.visitor_id,row.component,row.page_id,row.ts,row.event_id])).rows[0]?.path as string|null|undefined;}
it.skipIf(!process.env.TEST_DATABASE_URL)('bounded typed page lookup exactly matches real scalar SQL across ties tabs components and missing prefixes',async()=>{
 const pool=new Pool({connectionString:isolatedTestConnectionString(),max:1}),c=await pool.connect(),table='fact_ordered_'+randomUUID().replaceAll('-',''),pageA=randomUUID(),pageB=randomUUID();
 try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await c.query(`CREATE TEMP TABLE ${table}(visitor_id text,component bigint,page_id uuid,type text,ts timestamptz,event_id uuid,path text,payload jsonb) ON COMMIT DROP`);
 const rows:unknown[][]=[['standard',1,pageA,'pageview','2026-03-08T06:59:00Z',uuid(10),'/first',null],['standard',1,pageA,'pageview','2026-03-08T06:59:00Z',uuid(20),'/tie',{}],['standard',1,pageB,'pageview','2026-03-08T07:00:00Z',uuid(30),'/other-tab',null],['standard',2,pageA,'pageview','2026-03-08T07:01:00Z',uuid(40),'/other-component',{}],['other-visitor',1,pageA,'pageview','2026-03-08T07:02:00Z',uuid(50),'/other-visitor',{}],['standard',1,pageA,'event','2026-03-08T07:02:00Z',uuid(60),'/not-pv',null],['standard',1,pageA,'pageview','2026-03-09T04:01:00Z',uuid(70),null,null],['daily-day-one',1,pageA,'pageview','2026-03-08T07:00:00Z',uuid(80),'/day-one',{}],['empty-path',1,pageA,'pageview','2026-03-08T07:00:00Z',uuid(81),'',{}]];
 for(const r of rows)await c.query(`INSERT INTO ${table} VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,r);
 const query=(visitor_id:string,component:number,page_id:string|null,ts:string,event_id:string):Lookup=>({visitor_id,component,page_id,ts,event_id});
 const input=[query('standard',1,pageA,'2026-03-08T06:59:00Z',uuid(9)),query('standard',1,pageA,'2026-03-08T06:59:00Z',uuid(10)),query('standard',1,pageA,'2026-03-08T06:59:00Z',uuid(19)),query('standard',1,pageA,'2026-03-08T06:59:00Z',uuid(20)),query('standard',1,pageB,'2026-03-08T07:03:00Z',uuid(90)),query('standard',2,pageA,'2026-03-08T07:03:00Z',uuid(90)),query('other-visitor',1,pageA,'2026-03-08T07:03:00Z',uuid(90)),query('standard',1,pageA,'2026-03-08T07:03:00Z',uuid(90)),query('standard',1,pageA,'2026-03-09T04:02:00Z',uuid(90)),query('prefix-only',1,pageA,'2026-03-09T04:02:00Z',uuid(90)),query('daily-day-two',1,pageA,'2026-03-09T04:02:00Z',uuid(90)),query('standard',1,null,'2026-03-09T04:02:00Z',uuid(90)),query('empty-path',1,pageA,'2026-03-09T04:02:00Z',uuid(90))];
 const expected=[];for(const row of input)expected.push(await scalar(c,table,row));
 expect(expected).toEqual([undefined,'/first','/first','/tie','/other-tab','/other-component','/other-visitor','/tie',null,undefined,undefined,undefined,'']);
 const actual=await lookupSessionPagePaths(c,table,input);expect(actual).toEqual(expected.map(path=>path??undefined));
 expect(actual.map((path,i)=>path??`prefix-${i}`)).toEqual(expected.map((path,i)=>path??`prefix-${i}`));
 const hundred=Array.from({length:100},(_,i)=>input[i%input.length]!);const hundredExpected=[];for(const row of hundred)hundredExpected.push(await scalar(c,table,row));expect(await lookupSessionPagePaths(c,table,hundred)).toEqual(hundredExpected.map(path=>path??undefined));await expect(lookupSessionPagePaths(c,table,[...hundred,input[0]!])).rejects.toThrow('SESSION_PAGE_PATH_BATCH_LIMIT');expect(await lookupSessionPagePaths(c,table,[])).toEqual([]);
 }finally{await c.query('ROLLBACK');c.release();await pool.end();}
},30000);
