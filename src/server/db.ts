import pg, { type Pool, type PoolClient } from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
export function createPool(connectionString = process.env.DATABASE_URL ?? 'postgresql://baize_dev@127.0.0.1:5432/baize_dev') {
  return new pg.Pool({connectionString,max:10});
}
export async function transaction<T>(pool: Pool, fn:(client:PoolClient)=>Promise<T>):Promise<T> {
  const client=await pool.connect();
  try { await client.query('BEGIN'); const result=await fn(client); await client.query('COMMIT'); return result; }
  catch(error) { await client.query('ROLLBACK'); throw error; } finally {client.release();}
}
export async function migrate(pool:Pool, directory=resolve('db/migrations')) {
  const client=await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(92834101)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz DEFAULT now())');
    for(const name of (await readdir(directory)).filter(n=>/^\d+.*\.sql$/.test(n)).sort()) {
      const sql=await readFile(resolve(directory,name),'utf8');
      const checksum=createHash('sha256').update(sql).digest('hex');
      const found=await client.query('SELECT checksum FROM schema_migrations WHERE version=$1',[name]);
      if(found.rowCount) {if(found.rows[0].checksum!==checksum) throw new Error(`Migration checksum changed: ${name}`); continue;}
      await client.query('BEGIN');
      try {await client.query(sql); await client.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',[name,checksum]); await client.query('COMMIT');}
      catch(error){await client.query('ROLLBACK');throw error;}
    }
  } finally {await client.query('SELECT pg_advisory_unlock(92834101)');client.release();}
}
export async function lockSite(client:PoolClient,siteId:string){await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[siteId]);}
export async function dirtySite(client:PoolClient,siteId:string){await client.query('INSERT INTO aggregation_state(site_id,generation) VALUES($1,1) ON CONFLICT(site_id) DO UPDATE SET generation=aggregation_state.generation+1',[siteId]);}
