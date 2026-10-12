import {it,expect} from 'vitest';
import {Pool} from 'pg';
import {closePgCursor} from '../../src/server/pg-cursor-cleanup.js';
it.skipIf(!process.env.TEST_DATABASE_URL)('preserves real PG division error instead of aborted CLOSE and restores connection usability',async()=>{
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1}),client=await pool.connect();
 try{
  await client.query('BEGIN');await client.query('DECLARE cleanup_original NO SCROLL CURSOR FOR SELECT 1');
  const original=async()=>{try{await client.query('SELECT 1/0')}finally{await client.query('CLOSE cleanup_original')}};
  await expect(original()).rejects.toMatchObject({code:'25P02'});await client.query('ROLLBACK');
  await client.query('BEGIN');await client.query('DECLARE cleanup_corrected NO SCROLL CURSOR FOR SELECT 1');
  const corrected=async()=>{let failed=false;try{await client.query('SELECT 1/0')}catch(error){failed=true;throw error}finally{await closePgCursor(client,'cleanup_corrected',failed)}};
  await expect(corrected()).rejects.toMatchObject({code:'22012'});await client.query('ROLLBACK');expect((await client.query('SELECT 1 AS available')).rows).toEqual([{available:1}]);
  await client.query('BEGIN');await expect(closePgCursor(client,'cleanup_missing',false)).rejects.toMatchObject({code:'34000'});await client.query('ROLLBACK');
  await client.query('BEGIN');await client.query('DECLARE cleanup_success NO SCROLL CURSOR FOR SELECT 1');await closePgCursor(client,'cleanup_success',false);await client.query('COMMIT');expect((await client.query('SELECT 2 AS available')).rows).toEqual([{available:2}]);
 }finally{await client.query('ROLLBACK').catch(()=>{});client.release();await pool.end();}
});
