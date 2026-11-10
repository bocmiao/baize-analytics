import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {Pool,type PoolClient} from 'pg';
import {withBudgetedPgClient,withStatsReadBudget} from '../../src/server/stats-read-budget';

describe.skipIf(!process.env.TEST_DATABASE_URL)('statistics PG settings on reusable connections',()=>{
 let pool:Pool;
 beforeAll(()=>{pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1});});
 afterAll(async()=>{await pool?.end();});
 const settings=async(client:PoolClient)=>(await client.query("SELECT current_setting('jit') jit,current_setting('statement_timeout') statement,current_setting('lock_timeout') lock,current_setting('transaction_timeout') transaction")).rows[0];
 const scope=<T>(client:PoolClient,read:()=>Promise<T>)=>withStatsReadBudget(()=>withBudgetedPgClient(client,read));

 it.each(['on','off'])('restores original JIT=%s and stricter timeouts after nested successful reads',async jit=>{
  const client=await pool.connect();
  try{
   await client.query("SELECT set_config('jit',$1,false),set_config('statement_timeout','5s',false),set_config('lock_timeout','3s',false),set_config('transaction_timeout','9s',false)",[jit]);
   const original=await settings(client);
   const value=await scope(client,async()=>{
    expect(await settings(client)).toEqual({...original,jit:'off'});
    const result=await withBudgetedPgClient(client,async()=>{expect((await settings(client)).jit).toBe('off');return (await client.query('SELECT sum(n)::int value FROM generate_series(1,100) n')).rows[0].value;});
    expect((await settings(client)).jit).toBe('off');return result;
   });
   expect(value).toBe(5050);expect(await settings(client)).toEqual(original);
  }finally{await client.query('RESET ALL');client.release();}
 });

 it('restores settings after a failed read that rolls back its snapshot',async()=>{
  const client=await pool.connect();
  try{
   await client.query('SET jit=on');const original=await settings(client);
   await expect(scope(client,async()=>{await client.query('BEGIN');try{await client.query('SELECT 1/0');}catch(error){await client.query('ROLLBACK');throw error;}})).rejects.toMatchObject({code:'22012'});
   expect(await settings(client)).toEqual(original);
  }finally{await client.query('ROLLBACK');await client.query('RESET ALL');client.release();}
 });

 it('discards a connection if an aborted transaction prevents restoring settings',async()=>{
  const client=await pool.connect();const pid=(await client.query('SELECT pg_backend_pid() pid')).rows[0].pid;let ended=false;client.once('end',()=>{ended=true;});
  try{await expect(scope(client,async()=>{await client.query('BEGIN');await client.query('SELECT 1/0');})).rejects.toMatchObject({code:'22012'});expect(ended).toBe(true);}finally{client.release();}
  const next=await pool.connect();try{expect((await next.query('SELECT pg_backend_pid() pid')).rows[0].pid).not.toBe(pid);expect((await settings(next)).jit).toBe('on');}finally{next.release();}
 });

 it('keeps the read deadline effective and releases the terminated connection before reuse',async()=>{
  const client=await pool.connect();let ended=false;client.once('end',()=>{ended=true;});
  try{await expect(withStatsReadBudget(()=>withBudgetedPgClient(client,async()=>{await client.query('SELECT pg_sleep(1)');}),{deadlineMs:100})).rejects.toMatchObject({code:'stats_read_budget_exceeded'});expect(ended).toBe(true);}finally{client.release();}
  const next=await pool.connect();try{expect((await settings(next)).jit).toBe('on');expect((await next.query('SELECT 1 value')).rows[0].value).toBe(1);}finally{next.release();}
 });
});
