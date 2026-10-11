import {randomUUID} from 'node:crypto';
import {mkdtemp,readdir,copyFile,mkdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Pool,type PoolClient} from 'pg';
import {migrate} from '../../src/server/db.js';
import {isolatedTestConnectionString} from '../support/database-url.js';
import {consumeClickHouseCommand} from '../../src/server/clickhouse-command-response.js';
/** Isolated test namespaces and authentic migration files, never ambient public fixtures. */
export async function pre055UpgradeFixture(){
 const suffix=randomUUID().replaceAll('-',''),sourceSchema='pre055_source_'+suffix,targetSchema='pre055_target_'+suffix,database='baize_restore_pre055_'+suffix;
 const directory=await mkdtemp('/tmp/baize-pre055-'),migrations=join(directory,'migrations');await mkdir(migrations);
 for(const name of await readdir(resolve('db/migrations')))if(/^\d+.*\.sql$/.test(name)&&Number(name.slice(0,3))<=54)await copyFile(resolve('db/migrations',name),join(migrations,name));
 const admin=new Pool({connectionString:isolatedTestConnectionString()}),source=new Pool({connectionString:isolatedTestConnectionString(),options:`-c search_path=${sourceSchema}`,max:1}),target=new Pool({connectionString:isolatedTestConnectionString(),options:`-c search_path=${targetSchema}`,max:1});
 const config={url:process.env.CLICKHOUSE_TEST_URL!,username:process.env.CLICKHOUSE_TEST_USER||'baize',password:process.env.CLICKHOUSE_TEST_PASSWORD||'local-test-only'},targetUrl=new URL(config.url);targetUrl.searchParams.set('database',database);
 const command=async(query:string)=>{const u=new URL(config.url);u.searchParams.set('query',query);const response=await fetch(u,{method:'POST',headers:{'X-ClickHouse-User':config.username,'X-ClickHouse-Key':config.password},signal:AbortSignal.timeout(30000)});if(!response.ok){await response.body?.cancel();throw Error('PRE055_FIXTURE_COMMAND_FAILED');}await consumeClickHouseCommand(response,'PRE055_FIXTURE_COMMAND_FAILED');};
 await admin.query(`CREATE SCHEMA ${sourceSchema}`);await admin.query(`CREATE SCHEMA ${targetSchema}`);await migrate(source,migrations);await migrate(target,migrations);await command(`CREATE DATABASE ${database}`);
 return {directory,source,target,config,targetConfig:{...config,url:targetUrl.href},async upgrade(){await migrate(source);await migrate(target);},async copy(tables:string[]){for(const table of tables){const rows=(await source.query(`SELECT to_jsonb(t) data FROM ${table} t`)).rows;for(const row of rows)await target.query(`INSERT INTO ${table} SELECT * FROM jsonb_populate_record(NULL::${table},$1::jsonb)`,[row.data]);}},async transaction<T>(pool:Pool,fn:(c:PoolClient)=>Promise<T>){const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}},async close(){await command(`DROP DATABASE IF EXISTS ${database} SYNC`);await source.end();await target.end();await admin.query(`DROP SCHEMA ${sourceSchema} CASCADE`);await admin.query(`DROP SCHEMA ${targetSchema} CASCADE`);await admin.end();await rm(directory,{recursive:true,force:true});}};
}
