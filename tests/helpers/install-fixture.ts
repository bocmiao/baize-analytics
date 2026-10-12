import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createApp as createProductionApp,type AppOptions} from '../../src/server/app.js';

/** Known synthetic credential belongs only to isolated test directories/databases. */
export const fixtureInstallationNonce='42'.repeat(32);
export async function prepareInstallationFixture(keyDir:string){
 await mkdir(keyDir,{recursive:true,mode:0o700});
 try{await writeFile(resolve(keyDir,'install-nonce.json'),JSON.stringify({version:1,nonce:fixtureInstallationNonce}),{flag:'wx',mode:0o600});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
}
export async function createApp(options:AppOptions={}){
 const dataDir=resolve(options.dataDir??process.env.DATA_DIR??'data');
 const keyDir=resolve(options.keyDir??process.env.KEYS_DIR??dataDir+'-keys');
 await prepareInstallationFixture(keyDir);
 // These fixtures deliberately omit unrelated historical migrations. Bootstrap
 // remains a real prerequisite and is never suppressed by skipMigrate.
 if(options.skipMigrate&&options.pool){const client=await options.pool.connect();try{await client.query('BEGIN');const exists=await client.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='install_bootstrap' AND n.nspname=current_schema()");if(!exists.rowCount){const sql=await readFile(resolve('db/migrations/061_install_bootstrap.sql'),'utf8');await client.query(sql);await client.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',['061_install_bootstrap.sql',createHash('sha256').update(sql).digest('hex')]);}await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
 return createProductionApp({...options,dataDir,keyDir});
}
