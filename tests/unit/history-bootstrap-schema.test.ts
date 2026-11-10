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
it.each(['LF','CRLF'] as const)('accepts the pinned %s encoding of 061 and continues to the fact-version guard',async encoding=>{
 const text=(await readFile('db/migrations/061_install_bootstrap.sql','utf8')).replace(/\r\n/g,'\n'),bytes=encoding==='CRLF'?text.replace(/\n/g,'\r\n'):text;
 const checksum=createHash('sha256').update(bytes).digest('hex');
 expect(checksum).toBe(encoding==='LF'?'10a04db900b846c422b9e0ce3eee6959bc5daa40687276da78b056c2a294944d':'154a59ccfadcf7ad6ee33f7e3266311da489151be3b7f2c1dee5f1482c7a62d4');
 const query=vi.fn(async(sql:string)=>{if(sql.includes('analytics_fact_runs'))throw Error('VALIDATED_KNOWN_SCHEMA');return {rows:sql.startsWith('SELECT checksum')&&sql.includes('061_install_bootstrap')?[{checksum}]:[]};});
 await expect(backupHistoryNamespaces({query} as unknown as PoolClient,{} as HistoryStore,'/unused','source','/unused')).rejects.toThrow('VALIDATED_KNOWN_SCHEMA');expect(query).toHaveBeenCalledTimes(4);
});
it.each(['mixed-newlines','content-change','extra-byte'] as const)('rejects %s rather than normalizing arbitrary 061 input at runtime',async kind=>{
 const text=(await readFile('db/migrations/061_install_bootstrap.sql','utf8')).replace(/\r\n/g,'\n');const changed=kind==='mixed-newlines'?text.replace('\n','\r\n'):kind==='content-change'?text.replace('CREATE TABLE','CREATE TABLE IF NOT EXISTS'):text+'\n';expect(changed).not.toBe(text);
 const checksum=createHash('sha256').update(changed).digest('hex'),query=vi.fn(async(sql:string)=>({rows:sql.startsWith('SELECT checksum')?[{checksum}]:[]}));
 await expect(backupHistoryNamespaces({query} as unknown as PoolClient,{} as HistoryStore,'/unused','source','/unused')).rejects.toThrow('HISTORY_BACKUP_UNSUPPORTED_SCHEMA_CHECKSUM');expect(query).toHaveBeenCalledTimes(2);
});
