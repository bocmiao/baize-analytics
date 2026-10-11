import {installFactStore} from './fact-store.js';
import {installRemainingFactStore} from './remaining-fact-store.js';
import {cleanupRemainingFactStoreOrphans} from './remaining-fact-maintenance.js';
import {installCacheStore} from './cache-store.js';
import {cleanupCacheStoreOrphans} from './cache-store-maintenance.js';
import {cleanupFactStoreOrphans} from './fact-store-maintenance.js';
import {installSessionHeaderStore,cleanupSessionHeaderOrphans} from './session-header-store.js';
import {registerManualSearchImport} from './manual-search-import.js';
import {registerIntakeStatus} from './intake-status.js';
import {registerBotObservations} from './bot-observations.js';
import {registerSelfHostDiagnostics} from './self-host-diagnostics.js';
import {registerSiteAnnotations} from './site-annotations.js';
import {withPerformanceObservation,getPerformanceScopeId,type PerformanceSink} from './performance-observation.js';
import {registerCanonicalOperations} from './canonical-routes.js';
import {registerTrackerAssets} from './tracker-assets.js';
import {invalidateSiteAi} from './ai-invalidation.js';
import {invalidateSiteFacts} from './session-facts.js';
import {sanitizeCanonicalSitePrivacy} from './canonical-privacy-cleanup.js';
import {sanitizeSiteHistoryPrivacy} from './history-privacy.js';
import type {Transport} from './outbound.js';
import {cleanupHistoryBackupFiles} from './history-security.js';
import {HistoryStore,installHistoryStore,expireHistorySnapshots,cleanupHistoryFailures} from './history-store.js';
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
import { registerRequestRateLimits } from './request-rate-limit.js';
import { registerSites } from './sites.js';
import { registerCollect } from './collect.js';
import { registerAnalytics } from './analytics.js';
import { registerGovernance } from './governance.js';
import { registerExternal } from './external.js';
import { registerMcp } from './mcp.js';
import {CanonicalClickHouse,installCanonicalStore} from './canonical-clickhouse.js';
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
export interface AppOptions { pool?:Pool;redis?:Redis|null;dataDir?:string;keyDir?:string;publicUrl?:string;background?:boolean;masterKey?:Buffer;skipMigrate?:boolean;clickhouse?:ClickHouseStore|null;canonical?:CanonicalClickHouse|null;history?:HistoryStore|null;externalTransport?:Transport;performanceSink?:PerformanceSink }
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
  const canonical=options.canonical!==undefined?options.canonical:options.clickhouse===null?null:process.env.CLICKHOUSE_URL?new CanonicalClickHouse({url:process.env.CLICKHOUSE_URL,username:process.env.CLICKHOUSE_USER??'default',password:process.env.CLICKHOUSE_PASSWORD??''}):undefined;
  if(canonical){await canonical.initialize();const headerStore=await canonical.createSessionHeaderStore();await headerStore.initialize();installSessionHeaderStore(pool,headerStore);const factStore=await canonical.createFactStore();await factStore.initialize();installFactStore(pool,factStore);const remainingStore=await canonical.createRemainingFactStore();await remainingStore.initialize();installRemainingFactStore(pool,remainingStore);const cacheStore=await canonical.createCacheStore();await cacheStore.initialize();installCacheStore(pool,cacheStore);}else{installSessionHeaderStore(pool,null);installFactStore(pool,null);installRemainingFactStore(pool,null);installCacheStore(pool,null);}
  if(canonical!==undefined)installCanonicalStore(pool,canonical);
  const history=options.history!==undefined?options.history:process.env.HISTORY_STORE_ENABLED==='1'&&process.env.CLICKHOUSE_URL?new HistoryStore({url:process.env.CLICKHOUSE_URL,username:process.env.CLICKHOUSE_USER??'default',password:process.env.CLICKHOUSE_PASSWORD??''}):undefined;
  if(history)await history.initialize();
  if(history!==undefined)installHistoryStore(pool,history);
  const replay=await replayDeletionJournal(pool,dataDir,undefined,ctx.clickhouseMirror?(client,siteId)=>ctx.clickhouseMirror!.withDeletionBarrier(client,siteId,{all:true}):undefined);for(const siteId of replay.sites)await invalidateSiteCache(ctx,siteId);
  for(const site of (await pool.query("SELECT id,config FROM sites WHERE config->>'privacy_cleanup_version' ~ '^[1-9][0-9]*$'")).rows){
    await transaction(pool,async client=>{
      await lockSite(client,site.id);
      const current=(await client.query('SELECT config FROM sites WHERE id=$1',[site.id])).rows[0].config;
      const pending=String(current.privacy_cleanup_applied_version??'')!==String(current.privacy_cleanup_version);
      const authority=(await client.query('SELECT authority FROM canonical_event_authority WHERE site_id=$1',[site.id])).rows[0];
      let changed=0;
      if(authority?.authority==='clickhouse'){
        // Authoritative CH and historical raw may be the only surviving body.
        // Sanitize known aliases in place; never use a disposable mirror wipe.
        changed+=(await sanitizeCanonicalSitePrivacy(client,pool,site.id)).changed;
        changed+=(await sanitizeSiteHistoryPrivacy(client,pool,site.id)).changed;
      }else{
        // A restored disposable replica can reappear after this migration was applied.
        // Keep the physical barrier durable; invalidate published facts only once.
        await ctx.clickhouseMirror?.withDeletionBarrier(client,site.id,{all:true});
        if(pending)await invalidateSiteFacts(client,site.id);
        changed+=(await sanitizeSiteHistoryPrivacy(client,pool,site.id)).changed;
      }
      if(pending||changed)await invalidateSiteAi(client,site.id);
      await client.query("UPDATE sites SET config=config||jsonb_build_object('privacy_cleanup_applied_version',config->>'privacy_cleanup_version') WHERE id=$1",[site.id]);
    });
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
  if(options.performanceSink)app.addHook('onRequest',(req,reply,done)=>{const path=req.url.split('?')[0]!;const route=path==='/api/collect'?'collect':/^\/api\/v1\/sites\/[^/]+\/stats$/.test(path)?'stats':'other';withPerformanceObservation('http_request',options.performanceSink,()=>{const scope=getPerformanceScopeId();if(scope)reply.header('X-Baize-Performance-Scope',scope);done();},route);});
  app.addHook('onRequest',async(req,reply)=>{
    reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','strict-origin-when-cross-origin');
    if(!req.url.startsWith('/embed/'))reply.header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.url!=='/api/collect'&&!req.url.startsWith('/api/v1/experiments/')&&!req.headers.authorization){
      const origin=req.headers.origin;if(origin&&origin!==new URL(config.publicUrl).origin)throw new HttpError(403,'跨站请求被拒绝');
      if(req.headers['sec-fetch-site']==='cross-site')throw new HttpError(403,'跨站请求被拒绝');
    }
  });
  app.addHook('preParsing',async(req,_reply,payload)=>{if(req.headers['content-encoding']!=='gzip')return payload;let size=0;const chunks:Buffer[]=[];for await(const chunk of payload){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>1024*1024)throw new HttpError(413,'请求过大');chunks.push(bytes);}let out:Buffer;try{out=gunzipSync(Buffer.concat(chunks),{maxOutputLength:1024*1024});}catch{throw new HttpError(400,'无效或过大的 gzip 请求');}delete req.headers['content-encoding'];req.headers['content-length']=String(out.length);const {Readable}=await import('node:stream');return Readable.from(out);});
  app.setErrorHandler((error,_req,reply)=>{if(error instanceof ExternalError)return reply.code(error.statusCode).send({error:error.code,message:error.message});if(error instanceof z.ZodError)return reply.code(400).send({error:'invalid_request',issues:error.issues.map(i=>({path:i.path,message:i.message}))});const {statusCode,...body}=resolveApiError(error);if(body.error==='share_password_busy')reply.header('Retry-After','1');return reply.code(statusCode).send(body);});
  app.get('/healthz',async(_req,reply)=>{try{await pool.query('SELECT 1');let cache='disabled';if(redis){try{cache=await redis.ping()==='PONG'?'ready':'unavailable';}catch{cache='unavailable';}}return {ok:true,database:'ready',cache,geoip:geo.status,schemaVersion:1};}catch{return reply.code(503).send({ok:false,database:'unavailable'});}});
  registerRequestRateLimits(app,ctx);
  await registerAuth(app,ctx);await registerSites(app,ctx);await registerCollect(app,ctx,ip=>geo.lookup(ip));await registerAnalytics(app,ctx);await registerGovernance(app,ctx);const external=await registerExternal(app,ctx,options.externalTransport);await registerSSO(app,ctx);await registerGeoIPSettings(app,ctx);await registerClickHouseRoutes(app,ctx,ctx.clickhouseMirror);
  await registerMcp(app,ctx);await registerCanonicalOperations(app,ctx);await registerManualSearchImport(app,ctx);
  await registerIntakeStatus(app,ctx);await registerBotObservations(app,ctx);await registerSelfHostDiagnostics(app,ctx);await registerSiteAnnotations(app,ctx);
  await app.register(staticFiles,{root:resolve('public'),prefix:'/',decorateReply:true,serve:false});
  registerTrackerAssets(app);
  let web=false;try{await access(resolve('dist/web/index.html'));web=true;}catch{/* Build required before UI can run. */}
  if(web){app.get('/assets/*',async(req,reply)=>reply.sendFile((req.params as {'*':string})['*'],resolve('dist/web/assets')));}
  app.setNotFoundHandler(async(req,reply)=>{if(req.url.startsWith('/api/'))return reply.code(404).send({error:'not_found'});if(web)return reply.type('text/html').sendFile('index.html',resolve('dist/web'));return reply.code(503).send({error:'build_required',command:'npm run build'});});
  let busy=false;let lastMaintenance=0;let timer:NodeJS.Timeout|undefined;
  if(options.background!==false){timer=setInterval(async()=>{if(busy)return;busy=true;try{await withPerformanceObservation('background_worker',options.performanceSink,async()=>{await runWorkerOnce(pool);await ctx.clickhouseMirror?.runOnce();if(Date.now()-lastMaintenance>60000){await runGovernance(ctx);await enforceRetention(pool);if(history){await expireHistorySnapshots(pool,history);await cleanupHistoryFailures(pool,history);}await cleanupHistoryBackupFiles(pool,dataDir);await dropEmptyHistoricalPartitions(pool);await external.runJobs();await cleanupSessionHeaderOrphans(pool);await cleanupFactStoreOrphans(pool);await cleanupRemainingFactStoreOrphans(pool);await cleanupCacheStoreOrphans(pool);lastMaintenance=Date.now();}});}catch{/* Durable work remains queued; no raw event/error logging. */}finally{busy=false;}},1000);timer.unref();}
  app.addHook('onClose',async()=>{if(timer)clearInterval(timer);while(busy)await new Promise(r=>setTimeout(r,20));if(!options.pool)await pool.end();if(options.redis===undefined)await redis?.quit();});
  return {app,ctx};
}
