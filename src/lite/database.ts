import {DatabaseSync} from 'node:sqlite';
import {statfsSync} from 'node:fs';
import {initializeSchema} from './schema.js';
export function openDatabase(path:string,readOnly=false):DatabaseSync {
 const db=new DatabaseSync(path,{readOnly});
 const row=db.prepare('SELECT sqlite_version() version,sqlite_source_id() source').get() as {version:string;source:string};
 const [major,minor,patch]=row.version.split('.').map(Number);
 if(major!==3 || minor<51 || (minor===51&&patch<3) || (minor===52&&patch===0)){db.close();throw new Error('LITE_SQLITE_VERSION_UNSUPPORTED:'+row.version);}
 try{db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000;');
 if(!readOnly){db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=1000;');initializeSchema(db);} else db.exec('PRAGMA query_only=ON;');
 return db;}catch(error){db.close();throw error;}
}
export function verifyLocalFilesystem(dir:string):void {
 const type=Number(statfsSync(dir).type)>>>0;
 if([0x6969,0xff534d42,0x517b,0x73757245,0x564c,0x01021997].includes(type)) throw new Error('LITE_LOCAL_FILESYSTEM_REQUIRED');
}
export function transaction<T>(db:DatabaseSync,fn:()=>T):T {db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(error){try{db.exec('ROLLBACK');}catch{/* preserve original */}throw error;}}
