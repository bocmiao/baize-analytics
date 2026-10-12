import {expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type {PoolClient} from 'pg';
import type {HistoryStore} from '../../src/server/history-store.js';
import {backupHistoryNamespaces} from '../../src/server/history-namespace-backup.js';
it.each(['062_future.sql','061_unknown.sql'])('rejects unknown schema %s before reading journal or writing history',async version=>{
 const query=vi.fn(async()=>({rows:[{version}]}));
 await expect(backupHistoryNamespaces({query} as unknown as PoolClient,{} as HistoryStore,'/unused','source','/unused')).rejects.toThrow('HISTORY_BACKUP_UNSUPPORTED_FUTURE_SCHEMA');expect(query).toHaveBeenCalledTimes(1);
});
it('rejects tampered known061 before reading journal or writing history',async()=>{
 const query=vi.fn(async(sql:string)=>({rows:sql.startsWith('SELECT checksum')?[{checksum:'0'.repeat(64)}]:[]}));
 await expect(backupHistoryNamespaces({query} as unknown as PoolClient,{} as HistoryStore,'/unused','source','/unused')).rejects.toThrow('HISTORY_BACKUP_UNSUPPORTED_SCHEMA_CHECKSUM');expect(query).toHaveBeenCalledTimes(2);
});
it('known061 checksum matches the actual migration bytes',async()=>{
 const actual=createHash('sha256').update(await readFile('db/migrations/061_install_bootstrap.sql')).digest('hex');
 const source=await readFile('src/server/history-namespace-backup.ts','utf8');expect(source).toContain(`row.checksum!=='${actual}'`);
});
