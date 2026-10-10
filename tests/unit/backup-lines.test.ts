import {it,expect} from 'vitest';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {boundedBackupLines} from '../../src/server/backup-lines.js';
it('rejects a oversized line and a truncated tail before parsing',async()=>{const dir=await mkdtemp('/tmp/baize-backup-lines-'),file=join(dir,'data');try{const read=async()=>{const rows=[];for await(const line of boundedBackupLines(file,32))rows.push(line);return rows;};await writeFile(file,'a'.repeat(33)+'\n');await expect(read()).rejects.toThrow('BACKUP_ROW_LIMIT');await writeFile(file,'{"ok":true}\n{"truncated":true}');await expect(read()).rejects.toThrow('BACKUP_DATA_TRUNCATED');await writeFile(file,'{"ok":true}\n');expect(await read()).toEqual(['{"ok":true}']);}finally{await rm(dir,{recursive:true,force:true});}});
