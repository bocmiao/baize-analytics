import type {Transport} from './outbound.js';
import {cleanupHistoryBackupFiles} from './history-security.js';
import {HistoryStore,installHistoryStore,expireHistorySnapshots,cleanupHistoryFailures,historyDeletionBarrier} from './history-store.js';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import staticFiles from '@fastify/static';
import { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { z } from 'zod';
import { resolve } from 'node:path';
import { access } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createPool,migrate,transaction,lockSite } from './db.js';
import { masterKey,HttpError } from './security.js';
import { authFunctions,registerAuth } from './auth.js';
import { registerSites } from './sites.js';
import { registerCollect } from './collect.js';
import { registerAnalytics } from './analytics.js';
import { registerGovernance } from './governance.js';
import { registerExternal } from './external.js';
import { runGovernance } from './governance-worker.js';
import { runWorkerOnce,enforceRetention } from './worker.js';
import { replayDeletionJournal,invalidateSiteCache } from './deletion.js';
import { GeoIP,downloadGeoIP } from './geoip.js';
import type { AppContext } from './context.js';
import { initializeKeyring } from './keyring.js';
import { registerSSO } from './sso.js';
import { preparePartitions,dropEmptyHistoricalPartitions } from './partitions.js';
import {runFileCleanup} from './file-cleanup.js';
import {configuredGeoCredentials,registerGeoIPSettings} from './geoip-settings.js';
import {ClickHouseStore} from './clickhouse-store.js';
import {ClickHouseMirror,registerClickHouseRoutes} from './clickhouse-mirror.js';
import {EventStore,installEventStore} from './event-store.js';
import {ExternalError} from './external-errors.js';
import {resolveApiError} from '../shared/error-codes.js';
export interface AppOptions { pool?:Pool;redis?:Redis|null;dataDir?:string;keyDir?:string;publicUrl?:string;background?:boolean;masterKey?:Buffer;skipMigrate?:boolean;clickhouse?:ClickHouseStore|null;history?:HistoryStore|null;externalTransport?:Transport }
export async function createApp(options:AppOptions={}){
  const pool=options.pool??createPool();const dataDir=resolve(options.dataDir??process.env.DATA_DIR??'data');
  const redis=options.redis!==undefined?options.redis:process.env.REDIS_URL?new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:1}):null;
  redis?.on('error',()=>{/* Cache outage is observed via health; never log connection credentials. */});
  if(!options.skipMigrate)await migrate(pool);
  await preparePartitions(pool);
  const keyDir=resolve(options.keyDir??process.env.KEYS_DIR??dataDir+'-keys');
  const config:AppContext['config']={dataDir,keyDir,masterKey:options.masterKey??await masterKey(process.env.MASTER_KEY_FILE??resolve(keyDir,'master.key')),publicUrl:options.publicUrl??process.env.PUBLIC_URL??'http://127.0.0.1:3000'};
  await initializeKeyring(pool,config);
  const ctx:AppContext={pool,redis,config,...authFunctions(pool),audit:async(actorId,siteId,action,target)=>{await pool.query('INSERT INTO audit_logs(actor_id,site_id,action,target) VALUES($1,$2,$3,$4)',[actorId,siteId,action,JSON.stringify(target)]);}};
  const clickhouse=options.clickhouse!==undefined?options.clickhouse:process.env.CLICKHOUSE_URL?new ClickHouseStore({url:process.env.CLICKHOUSE_URL,username:process.env.CLICKHOUSE_USER??'default',password:process.env.CLICKHOUSE_PASSWORD??''}):undefined;
  if(clickhouse)ctx.clickhouseMirror=new ClickHouseMirror(pool,clickhouse);
  installEventStore(pool,new EventStore(pool,clickhouse??undefined));
  const history=options.history!==undefined?options.history:process.env.HISTORY_STORE_ENABLED==='1'&&process.env.CLICKHOUSE_URL?new HistoryStore({url:process.env.CLICKHOUSE_URL,username:process.env.CLICKHOUSE_USER??'default',password:process.env.CLICKHOUSE_PASSWORD??''}):undefined;
  if(history)await history.initialize();
  if(history!==undefined)installHistoryStore(pool,history);
  const replay=await replayDeletionJournal(pool,dataDir,undefined,ctx.clickhouseMirror?(client,siteId)=>ctx.clickhouseMirror!.withDeletionBarrier(client,siteId,{all:true}):undefined);for(const siteId of replay.sites)await invalidateSiteCache(ctx,siteId);
  for(const site of (await pool.query("SELECT id FROM sites WHERE config->>'privacy_cleanup_version' ~ '^[1-9][0-9]*$'")).rows){
    await transaction(pool,async client=>{await lockSite(client,site.id);await ctx.clickhouseMirror?.withDeletionBarrier(client,site.id,{all:true});await historyDeletionBarrier(client,pool,site.id);});
    await invalidateSiteCache(ctx,site.id);
  }
  await runFileCleanup(ctx);
  const geo=new GeoIP();await geo.open(dataDir);
  ctx.geoReload=async(enabled=true)=>{if(enabled)await geo.open(dataDir);else geo.disable();};
  const configuredGeo=await configuredGeoCredentials(ctx);
  if(configuredGeo?.enabled===false)geo.disable();
  const geoAccount=configuredGeo?configuredGeo.enabled?configuredGeo.accountId:undefined:process.env.MAXMIND_ACCOUNT_ID;
  const geoLicense=configuredGeo?configuredGeo.enabled?configuredGeo.licenseKey:undefined:process.env.MAXMIND_LICENSE_KEY;
  if(geo.status==='unknown'&&geoAccount&&geoLicense){try{await downloadGeoIP(dataDir,geoAccount,geoLicense);await geo.open(dataDir);}catch{/* Optional GeoIP unavailable: clear unknown status; do not echo credentials. */}}
  const app=Fastify({logger:false,bodyLimit:1024*1024,trustProxy:process.env.TRUSTED_PROXIES?.split(',').filter(Boolean)??false});
  await app.register(cookie);
  app.addHook('onRequest',async(req,reply)=>{
    reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','strict-origin-when-cross-origin');
    if(!req.url.startsWith('/embed/'))reply.header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.url!=='/api/collect'&&!req.url.startsWith('/api/v1/experiments/')&&!req.headers.authorization){
      const origin=req.headers.origin;if(origin&&origin!==new URL(config.publicUrl).origin)throw new HttpError(403,'跨站请求被拒绝');
      if(req.headers['sec-fetch-site']==='cross-site')throw new HttpError(403,'跨站请求被拒绝');
    }
  });
  app.addHook('preParsing',async(req,_reply,payload)=>{if(req.headers['content-encoding']!=='gzip')return payload;let size=0;const chunks:Buffer[]=[];for await(const chunk of payload){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>1024*1024)throw new HttpError(413,'请求过大');chunks.push(bytes);}let out:Buffer;try{out=gunzipSync(Buffer.concat(chunks),{maxOutputLength:1024*1024});}catch{throw new HttpError(400,'无效或过大的 gzip 请求');}delete req.headers['content-encoding'];req.headers['content-length']=String(out.length);const {Readable}=await import('node:stream');return Readable.from(out);});
  app.setErrorHandler((error,_req,reply)=>{if(error instanceof ExternalError)return reply.code(error.statusCode).send({error:error.code,message:error.message});if(error instanceof z.ZodError)return reply.code(400).send({error:'invalid_request',issues:error.issues.map(i=>({path:i.path,message:i.message}))});const {statusCode,...body}=resolveApiError(error);return reply.code(statusCode).send(body);});
  app.get('/healthz',async(_req,reply)=>{try{await pool.query('SELECT 1');let cache='disabled';if(redis){try{cache=await redis.ping()==='PONG'?'ready':'unavailable';}catch{cache='unavailable';}}return {ok:true,database:'ready',cache,geoip:geo.status,schemaVersion:1};}catch{return reply.code(503).send({ok:false,database:'unavailable'});}});
  await registerAuth(app,ctx);await registerSites(app,ctx);await registerCollect(app,ctx,ip=>geo.lookup(ip));await registerAnalytics(app,ctx);await registerGovernance(app,ctx);const external=await registerExternal(app,ctx,options.externalTransport);await registerSSO(app,ctx);await registerGeoIPSettings(app,ctx);await registerClickHouseRoutes(app,ctx,ctx.clickhouseMirror);
  await app.register(staticFiles,{root:resolve('public'),prefix:'/',decorateReply:true,serve:false});
  for(const name of ['tracker','tracker-min','tracker-vitals','tracker-replay','tracker-heatmap','tracker-consent'])app.get(`/${name}.js`,async(_req,reply)=>reply.header('Access-Control-Allow-Origin','*').type('application/javascript').sendFile(`${name}.js`,resolve('public')));
  let web=false;try{await access(resolve('dist/web/index.html'));web=true;}catch{/* Build required before UI can run. */}
  if(web){app.get('/assets/*',async(req,reply)=>reply.sendFile((req.params as {'*':string})['*'],resolve('dist/web/assets')));}
  app.setNotFoundHandler(async(req,reply)=>{if(req.url.startsWith('/api/'))return reply.code(404).send({error:'not_found'});if(web)return reply.type('text/html').sendFile('index.html',resolve('dist/web'));return reply.code(503).send({error:'build_required',command:'npm run build'});});
  let busy=false;let lastMaintenance=0;let timer:NodeJS.Timeout|undefined;
  if(options.background!==false){timer=setInterval(async()=>{if(busy)return;busy=true;try{await runWorkerOnce(pool);await ctx.clickhouseMirror?.runOnce();if(Date.now()-lastMaintenance>60000){await runGovernance(ctx);await enforceRetention(pool);if(history){await expireHistorySnapshots(pool,history);await cleanupHistoryFailures(pool,history);}await cleanupHistoryBackupFiles(pool,dataDir);await dropEmptyHistoricalPartitions(pool);await external.runJobs();lastMaintenance=Date.now();}}catch{/* Durable work remains queued; no raw event/error logging. */}finally{busy=false;}},1000);timer.unref();}
  app.addHook('onClose',async()=>{if(timer)clearInterval(timer);while(busy)await new Promise(r=>setTimeout(r,20));if(!options.pool)await pool.end();if(options.redis===undefined)await redis?.quit();});
  return {app,ctx};
}
