import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {CanonicalClickHouse,installCanonicalStore} from '../src/server/canonical-clickhouse.js';
import {HistoryStore,captureSiteHistory,installHistoryStore} from '../src/server/history-store.js';
import {createApp} from '../src/server/app.js';
import {deleteVisitor} from '../src/server/deletion.js';
import type {StoredEvent} from '../src/server/clickhouse-store.js';
const mode=process.argv[2],file=process.argv[3];
if(process.env.OPS_ISOLATED_STACK!=='1'||!file||!process.env.DATABASE_URL||!process.env.CLICKHOUSE_URL)throw Error('Explicit isolated operational fixture required');
const pool=new Pool({connectionString:process.env.DATABASE_URL}),config={url:process.env.CLICKHOUSE_URL,username:process.env.CLICKHOUSE_USER??'default',password:process.env.CLICKHOUSE_PASSWORD??''},store=new CanonicalClickHouse(config),history=new HistoryStore(config);installCanonicalStore(pool,store);installHistoryStore(pool,history);
try{
 if(mode==='seed'){
  const site=randomUUID(),epoch=randomUUID(),batch=randomUUID();await store.initialize();await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'isolated canonical ops','example.invalid','isolated-fixture')",[site]);await pool.query('INSERT INTO aggregation_state(site_id,epoch,generation,processed_generation) VALUES($1,$2,1,1)',[site,epoch]);
  // Fixture-only direct authority: operator activation remains closed.
  await pool.query("INSERT INTO canonical_event_authority(site_id,authority,epoch) VALUES($1,'clickhouse',$2)",[site,epoch]);
  const c=await pool.connect();try{await c.query('BEGIN');const input=[];for(const visitor of ['A','B']){const event:StoredEvent={site_id:site,event_id:randomUUID(),visitor_id:visitor,page_id:randomUUID(),ts:new Date(Date.now()-60000).toISOString(),type:'pageview',path:'/'+visitor,dimensions:{device:'desktop'},payload:{}};await c.query('INSERT INTO event_keys(site_id,event_id,hash,ts,visitor_id) VALUES($1,$2,$3,$4,$5)',[site,event.event_id,'accepted-fixture',event.ts,visitor]);input.push({event,acceptedHash:'accepted-fixture'});}await store.publishBatch(c,site,batch,epoch,input);await c.query('COMMIT');}finally{c.release();}
  const manifest=await captureSiteHistory(pool,history,site);await writeFile(file,JSON.stringify({site,history:manifest}),{mode:0o600});console.log('Isolated canonical fixture and historical namespace published.');
 }else if(mode==='delete'){
  const state=JSON.parse(await readFile(file,'utf8'));const runtime=await createApp({pool,redis:null,background:false});try{assert.equal((await deleteVisitor(runtime.ctx,state.site,{visitor_id:'A'},null)).deleted,true);}finally{await runtime.app.close();}console.log('Independent durable journal physically deleted A.');
 }else if(mode==='verify'){
  const state=JSON.parse(await readFile(file,'utf8')),client=await pool.connect();try{await client.query('BEGIN');const events=[];for await(const batch of store.streamCommitted(client,state.site))events.push(...batch);assert.deepEqual(events.map(event=>event.visitor_id),['B']);assert.equal(Number((await client.query('SELECT count(*) n FROM events WHERE site_id=$1',[state.site])).rows[0].n),0);assert.equal(Number((await client.query('SELECT count(*) n FROM canonical_event_authority WHERE site_id=$1 AND authority=\'clickhouse\'',[state.site])).rows[0].n),1);const manifests=(await client.query("SELECT manifest FROM history_manifests WHERE site_id=$1 AND status='published'",[state.site])).rows;assert(manifests.length>0);for(const row of manifests)await history.verify(row.manifest);await client.query('COMMIT');console.log(JSON.stringify({verified:true,sourceDigest:createHash('sha256').update(JSON.stringify({events,manifests})).digest('hex')}));}finally{client.release();}
 }else throw Error('Unknown isolated stack fixture mode');
}finally{await pool.end();}
