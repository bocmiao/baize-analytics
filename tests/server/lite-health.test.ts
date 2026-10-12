import {it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {bareLiteHttp} from './lite-http-fixture.js';
it('Lite readiness reports validated actual schema without bootstrap secrets',async()=>{const f=await bareLiteHttp();try{const db=new DatabaseSync(join(f.dataDir,'lite.sqlite'),{readOnly:true});const version=Number(db.prepare('PRAGMA user_version').get()!.user_version);db.close();const response=await f.app.inject('/healthz');expect(response.statusCode).toBe(200);const result=response.json();expect(result.schemaVersion).toBe(version);expect(version).toBe(2);expect(Object.keys(result).sort()).toEqual(['cache','database','geoip','ok','schemaVersion','sourceId','sqliteVersion','storage']);}finally{await f.close();}});
it('Lite readiness fails closed when schema validation fails',async()=>{const f=await bareLiteHttp();try{const db=new DatabaseSync(join(f.dataDir,'lite.sqlite'));db.exec('PRAGMA user_version=99');db.close();const response=await f.app.inject('/healthz');expect(response.statusCode).toBe(503);expect(response.json()).toEqual({ok:false,database:'unavailable'});}finally{await f.close();}});
