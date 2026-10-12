import {createHash} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
export function initializeSchema(db:DatabaseSync):void {
 const version=Number(db.prepare('PRAGMA user_version').get()!.user_version);if(version>1)throw new Error('LITE_SCHEMA_NEWER_THAN_APPLICATION');
 const ddl=`
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password_hash TEXT NOT NULL,is_admin INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS auth_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sites(id TEXT PRIMARY KEY,name TEXT NOT NULL,domain TEXT NOT NULL,timezone TEXT NOT NULL,privacy_mode TEXT NOT NULL CHECK(privacy_mode IN ('standard','daily_salt')),retention_days INTEGER NOT NULL,salt_secret TEXT NOT NULL,config TEXT NOT NULL DEFAULT '{}',owner_id TEXT NOT NULL REFERENCES users(id),generation INTEGER NOT NULL DEFAULT 0,epoch TEXT NOT NULL,processed_generation INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS site_members(site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,role TEXT NOT NULL,PRIMARY KEY(site_id,user_id));
 CREATE TABLE IF NOT EXISTS events(site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,event_id TEXT NOT NULL,ts INTEGER NOT NULL,visitor_id TEXT NOT NULL,page_id TEXT NOT NULL,type TEXT NOT NULL,path TEXT NOT NULL,payload TEXT NOT NULL,dimensions TEXT NOT NULL,PRIMARY KEY(site_id,event_id));
 CREATE INDEX IF NOT EXISTS events_site_ts ON events(site_id,ts,event_id);
 CREATE INDEX IF NOT EXISTS events_visitor ON events(site_id,visitor_id);
 CREATE TABLE IF NOT EXISTS receipts(site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,event_id TEXT NOT NULL,wire_hash TEXT NOT NULL,ts INTEGER NOT NULL,visitor_id TEXT NOT NULL,page_id TEXT NOT NULL,type TEXT NOT NULL,parent_event_id TEXT,PRIMARY KEY(site_id,event_id));
 CREATE TABLE IF NOT EXISTS revenue_orders(site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,order_hash TEXT NOT NULL,event_id TEXT NOT NULL,visitor_id TEXT NOT NULL,ts INTEGER NOT NULL,currency TEXT NOT NULL,amount REAL NOT NULL,PRIMARY KEY(site_id,order_hash));
 CREATE TABLE IF NOT EXISTS goals(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,name TEXT NOT NULL,definition TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,kind TEXT NOT NULL,dedupe_key TEXT NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL,token TEXT,attempts INTEGER NOT NULL DEFAULT 0,lease_until INTEGER,next_at INTEGER NOT NULL,epoch TEXT NOT NULL,generation INTEGER NOT NULL,result TEXT,error TEXT,UNIQUE(site_id,kind,dedupe_key));
 CREATE INDEX IF NOT EXISTS jobs_due ON jobs(status,next_at,lease_until);
 CREATE TABLE IF NOT EXISTS rollups(site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,hour INTEGER NOT NULL,data TEXT NOT NULL,epoch TEXT NOT NULL,generation INTEGER NOT NULL,PRIMARY KEY(site_id,hour));
 CREATE TABLE IF NOT EXISTS tombstones(seq INTEGER PRIMARY KEY,site_id TEXT NOT NULL,visitor_id TEXT,user_id TEXT,at INTEGER NOT NULL,journal_hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS exports(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,format TEXT NOT NULL,status TEXT NOT NULL,file TEXT,generation INTEGER NOT NULL,epoch TEXT NOT NULL,created_at INTEGER NOT NULL,error TEXT);
 `;
 const actual=()=>createHash('sha256').update(JSON.stringify(db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name<>'schema_migrations' ORDER BY type,name").all())).digest('hex');
 const checksum=createHash('sha256').update(ddl).digest('hex');
 if(version===1){const table=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();if(!table)throw new Error('LITE_SCHEMA_UNKNOWN');const saved=db.prepare('SELECT checksum,schema_hash FROM schema_migrations WHERE version=1').get();if(!saved||saved.checksum!==checksum||saved.schema_hash!==actual())throw new Error('LITE_SCHEMA_CHECKSUM_MISMATCH');return;}
 if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1").get())throw new Error('LITE_SCHEMA_UNKNOWN');
 db.exec('BEGIN IMMEDIATE');try{db.exec(ddl);db.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,schema_hash TEXT NOT NULL)');db.prepare('INSERT INTO schema_migrations VALUES(1,?,?)').run(checksum,actual());db.exec('PRAGMA user_version=1; COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
