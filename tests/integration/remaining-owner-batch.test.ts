import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {insertRemainingOwnerBatch,resolveRemainingOwnerBatch} from '../../src/server/remaining-owner-batch.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)('exact owner batch real PostgreSQL',()=>{
 it('matches rowwise owners, preserves priorities, and rolls back duplicates and missing owners',async()=>{
  const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1}),c=await pool.connect(),run=randomUUID(),relations={owners:'batch_owners',carryOwners:'batch_carry_owners'};
  try{await c.query('BEGIN');await c.query('CREATE TEMP TABLE batch_owners(run_id uuid,session_id uuid,visitor_id text,started_at timestamptz,ended_at timestamptz,priority integer,PRIMARY KEY(run_id,session_id,priority)) ON COMMIT DROP');await c.query('CREATE TEMP TABLE batch_carry_owners(run_id uuid,visitor_id text,session_id uuid,PRIMARY KEY(run_id,visitor_id)) ON COMMIT DROP');await c.query('CREATE TEMP TABLE oracle_owners(LIKE batch_owners INCLUDING ALL) ON COMMIT DROP');
   const rows=Array.from({length:100},(_,i)=>({sessionId:randomUUID(),visitorId:i===0?'__proto__':`visitor-${i}`,from:'2026-03-08T23:59:00.001Z',to:'2026-03-09T00:01:00.002Z'}));
   await insertRemainingOwnerBatch(c,relations,run,'sessions',rows);await insertRemainingOwnerBatch(c,relations,run,'carry_checkpoints',rows);
   for(const row of rows)for(const priority of [0,1])await c.query('INSERT INTO oracle_owners VALUES($1,$2,$3,$4,$5,$6)',[run,row.sessionId,row.visitorId,row.from,row.to,priority]);
   expect((await c.query('(TABLE batch_owners EXCEPT ALL TABLE oracle_owners) UNION ALL (TABLE oracle_owners EXCEPT ALL TABLE batch_owners)')).rows).toEqual([]);
   await c.query("UPDATE batch_owners SET visitor_id='lower-priority-identity',started_at='2026-03-12' WHERE priority=1 AND session_id=$1",[rows[0]!.sessionId]);
   const fallbackSession=randomUUID();let sealedReads=0;const resolved=await resolveRemainingOwnerBatch(c,relations.owners,run,[rows[0]!.sessionId,rows[1]!.sessionId,fallbackSession,fallbackSession],async()=>{sealedReads++;return {visitor_id:'distinct-B-identity',started_at:'2026-03-10T23:59:00.001Z',ended_at:'2026-03-11T00:01:00.002Z'};});expect(sealedReads).toBe(1);expect(resolved.get(rows[0]!.sessionId)!.visitor_id).toBe(rows[0]!.visitorId);expect(new Date(resolved.get(rows[0]!.sessionId)!.started_at).toISOString()).toBe(rows[0]!.from);expect(resolved.get(fallbackSession)!.visitor_id).toBe('distinct-B-identity');expect((await c.query('SELECT priority FROM batch_owners WHERE session_id=$1',[fallbackSession])).rows).toEqual([{priority:2}]);await c.query('DELETE FROM batch_owners WHERE session_id=$1',[fallbackSession]);
   await insertRemainingOwnerBatch(c,relations,run,'carry_keys',rows);expect((await c.query('SELECT count(*)::int n FROM batch_owners')).rows[0].n).toBe(200);
   await c.query('SAVEPOINT duplicate');await expect(insertRemainingOwnerBatch(c,relations,run,'sessions',[rows[0]!])).rejects.toMatchObject({code:'23505'});await c.query('ROLLBACK TO SAVEPOINT duplicate');
   await c.query('SAVEPOINT within_batch');const duplicate={...rows[0]!,sessionId:randomUUID()};await expect(insertRemainingOwnerBatch(c,relations,run,'sessions',[duplicate,duplicate])).rejects.toMatchObject({code:'23505'});await c.query('ROLLBACK TO SAVEPOINT within_batch');
   await expect(insertRemainingOwnerBatch(c,relations,run,'carry_keys',[{...rows[0]!,visitorId:'wrong-owner'}])).rejects.toThrow('REMAINING_CARRY_OWNER_MISSING');
   expect((await c.query('SELECT count(*)::int n FROM batch_owners')).rows[0].n).toBe(200);expect(pool.waitingCount).toBe(0);await c.query('COMMIT');expect((await c.query("SELECT to_regclass('pg_temp.batch_owners') gone")).rows[0].gone).toBeNull();
  }finally{await c.query('ROLLBACK');c.release();await pool.end();}
 });
});
