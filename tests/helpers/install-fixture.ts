import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
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
 if(options.skipMigrate&&options.pool){const exists=await options.pool.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='install_bootstrap' AND n.nspname=current_schema()");if(!exists.rowCount)await options.pool.query(await readFile(resolve('db/migrations/061_install_bootstrap.sql'),'utf8'));}
 return createProductionApp({...options,dataDir,keyDir});
}
