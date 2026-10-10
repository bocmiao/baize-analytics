import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {Pool} from 'pg';
import {backupCanonical} from '../../src/server/canonical-backup.js';
import {lockSite} from '../../src/server/db.js';
import type {CanonicalClickHouse} from '../../src/server/canonical-clickhouse.js';
/** Real production CLI, actual signed raw bodies; no fake proof or manual authority assignment. */
export async function pruneRawViaSignedCli(pool:Pool,store:CanonicalClickHouse,siteId:string,journalDir:string){
 const directory=join(journalDir,'raw-operator-'+randomUUID()),keyFile=join(directory,'signing.key'),key=Buffer.alloc(32,67);await mkdir(directory,{mode:0o700});await writeFile(keyFile,key,{mode:0o600});const c=await pool.connect();try{await c.query('BEGIN');await lockSite(c,siteId);await backupCanonical(c,store,siteId,join(directory,'raw'),journalDir,{key});await c.query('COMMIT');}finally{await c.query('ROLLBACK');c.release();key.fill(0);}
 const url=new URL(pool.options.connectionString!);if(pool.options.options)url.searchParams.set('options',String(pool.options.options));const {stdout}=await promisify(execFile)(process.execPath,['--import','tsx','scripts/canonical-cli.ts','prune',siteId,join(directory,'raw'),journalDir],{cwd:process.cwd(),env:{...process.env,DATABASE_URL:url.href,CLICKHOUSE_URL:process.env.CLICKHOUSE_TEST_URL,CLICKHOUSE_USER:'baize',CLICKHOUSE_PASSWORD:'local-test-only',MASTER_KEY_FILE:keyFile,KEYS_DIR:''},timeout:60000,maxBuffer:65536});return JSON.parse(stdout) as {pruned:number;remaining:boolean};
}
