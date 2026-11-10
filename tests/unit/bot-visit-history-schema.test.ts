import {it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type {PoolClient} from 'pg';
import type {HistoryStore} from '../../src/server/history-store.js';
import {backupHistoryNamespaces} from '../../src/server/history-namespace-backup.js';
it('pins the named062 LF migration checksum without changing historical fact signature scope',async()=>{
 const bytes=await readFile('db/migrations/062_bot_visit_log.sql'),actual=createHash('sha256').update(bytes).digest('hex');
 expect(bytes.includes(Buffer.from('\r\n'))).toBe(false);
 const source=await readFile('src/server/history-namespace-backup.ts','utf8');expect(source).toContain(`row.checksum!=='${actual}'`);
 const guard=source.match(/SELECT version FROM schema_migrations[^"\n]+/)?.[0];expect(guard).toContain("'062_bot_visit_log.sql'");
 expect(source).not.toContain('+062-');
 const backup=await readFile('scripts/backup.sh','utf8');expect(backup).toContain('pg_dump -U baize -d baize -Fc');expect(backup).not.toContain('--exclude-table');
});
it('rejects a changed062 migration before any history export writes',async()=>{
 const query=vi.fn(async(sql:string)=>({rows:sql.startsWith('SELECT checksum')&&sql.includes('062_bot_visit_log')?[{checksum:'0'.repeat(64)}]:[]}));
 await expect(backupHistoryNamespaces({query} as unknown as PoolClient,{} as HistoryStore,'/unused','source','/unused')).rejects.toThrow('HISTORY_BACKUP_UNSUPPORTED_SCHEMA_CHECKSUM');expect(query).toHaveBeenCalledTimes(3);
});
