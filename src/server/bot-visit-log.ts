import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import type {AppContext} from './context.js';
import {classifyBotUA,type BotDecision} from './bot-filter.js';
import {lockSite,transaction} from './db.js';
import {anonymizeIP,canonical,hashToken,HttpError,matchesCIDR} from './security.js';
import {networkIPIdentity,normalizeNetworkIP,summarizeIPIdentities} from './network-ip.js';
import {recordBotObservationInTransaction} from './bot-observations.js';

const DAY=86400000;
export const BOT_VISIT_MAX_RETENTION_DAYS=90;
const siteIdSchema=z.string().min(1).max(128);
export const botVisitWindowSchema=z.object({
 from:z.iso.date(),to:z.iso.date(),page:z.coerce.number().int().min(1).max(10000).default(1),
 limit:z.coerce.number().int().min(1).max(100).default(50),engine:z.string().regex(/^[a-z0-9-]{1,64}$/).optional(),
 source:z.enum(['collector','server_log']).optional(),
}).strict().refine(q=>q.from<=q.to&&Date.parse(q.to)-Date.parse(q.from)<31*DAY,'At most31 calendar days');
export const botVisitIngestSchema=z.object({
 sent_at:z.number().int().nonnegative(),
 visits:z.array(z.object({id:z.uuid(),ts:z.number().int().nonnegative(),ip:z.string().min(1).max(80),
  path:z.string().min(1).max(10000),user_agent:z.string().min(1).max(8192)}).strict()).min(1).max(100),
}).strict();
const engineRules:[string,string[]][]=[
 ['google',['googlebot','google-extended']],['bing',['bingbot','bingpreview']],['baidu',['baiduspider']],
 ['sogou',['sogou']],['360',['360spider']],['yandex',['yandexbot']],['duckduckgo',['duckduckbot']],
 ['apple',['applebot']],['petal',['petalbot']],['openai',['gptbot','chatgpt-user','oai-searchbot']],
 ['anthropic',['claudebot','claude-user','claude-searchbot','anthropic-ai']],['perplexity',['perplexitybot','perplexity-user']],
 ['bytedance',['bytespider']],['cohere',['cohere-ai']],['diffbot',['diffbot']],
 ['facebook',['facebookexternalhit']],['slack',['slackbot']],['twitter',['twitterbot']],['linkedin',['linkedinbot']],
 ['uptimerobot',['uptimerobot']],['pingdom',['pingdom']],['automation',['headlesschrome','phantomjs','selenium']],
];
/** UA claims identify a family; this does not verify the requester owns that engine's IP. */
export function botEngine(userAgent:string,decision:BotDecision):string {
 if(decision.reason!=='ua')return 'unknown';
 const ua=userAgent.slice(0,8192).toLowerCase();
 const preferred:Record<string,string>={openai:'openai',anthropic:'anthropic',perplexity:'perplexity','google-ai-policy':'google'};
 if(decision.ruleId&&preferred[decision.ruleId])return preferred[decision.ruleId]!;
 if(decision.category==='ai')return engineRules.find(([engine,tokens])=>['bytedance','cohere','diffbot'].includes(engine)&&tokens.some(token=>ua.includes(token)))?.[0]??'other';
 return engineRules.find(([,tokens])=>tokens.some(token=>ua.includes(token)))?.[0]??'other';
}
/** Accept a URL or absolute path; query, fragment, origin and credentials never enter the ledger. */
export function safeBotPath(value:unknown,ip=''):string|null {
 if(typeof value!=='string'||!value||value.length>10000||/[\u0000-\u001f\u007f]/.test(value))return null;
 let path:string;
 try{
  if(value.startsWith('/')&&!value.startsWith('//'))path=new URL(value,'https://path.invalid').pathname;
  else {const url=new URL(value);if(!['http:','https:'].includes(url.protocol))return null;path=url.pathname;}
 }catch{return null;}
 if(ip){path=path.split(ip).join('[redacted-ip]').split(encodeURIComponent(ip)).join('[redacted-ip]');}
 return path&&path.length<=2048&&!/[?#]/.test(path)?path:null;
}
export interface BotVisitInput {
 siteId:string;ip:string;userAgent:string;path:unknown;decision:BotDecision;at?:number;
 requestId?:string;source?:'collector'|'server_log';
 observation?:{ruleVersion:number;declaredEvents:number};
}
interface BotSite {
 id:string;salt_secret:string;privacy_mode:string;retention_days:number;timezone:string;
 config:{write_key_hash?:string;excluded_ips?:string[];archived_at?:string};
}
export type BotVisitResult={recorded:boolean;duplicate?:boolean;reason?:string};
function retentionDays(site:BotSite){return Math.max(1,Math.min(BOT_VISIT_MAX_RETENTION_DAYS,Number(site.retention_days)||1));}
async function insertVisit(client:PoolClient,site:BotSite,input:BotVisitInput,now:number):Promise<BotVisitResult>{
 const decision=input.decision;
 if(!decision.isBot||!decision.category||!decision.reason)return {recorded:false,reason:'not_detected_as_bot'};
 const ip=normalizeNetworkIP(input.ip),path=safeBotPath(input.path,input.ip),at=input.at??now;
 if(!ip)return {recorded:false,reason:'invalid_ip'};
 if(!path)return {recorded:false,reason:'invalid_path'};
 if(!Number.isSafeInteger(at)||at>now+300000||at<now-retentionDays(site)*DAY)return {recorded:false,reason:'outside_retention_or_future'};
 if((site.config.excluded_ips??[]).some(cidr=>matchesCIDR(ip,cidr)))return {recorded:false,reason:'excluded_ip'};
 const id=input.requestId??randomUUID();if(!z.uuid().safeParse(id).success)return {recorded:false,reason:'invalid_id'};
 const source=input.source??'collector',engine=botEngine(input.userAgent,decision),ruleId=(decision.ruleId??'').slice(0,64);
 // Daily-salt mode deliberately stores neither an address prefix nor a stable IP identity.
 const identity=site.privacy_mode==='daily_salt'?null:networkIPIdentity(ip,site.id,site.salt_secret);
 const prefix=site.privacy_mode==='daily_salt'?null:anonymizeIP(ip);
 const receipt=createHmac('sha256',site.salt_secret).update(canonical({site:site.id,source,at,engine,category:decision.category,
  reason:decision.reason,ruleId,path,identity})).digest('hex');
 const inserted=await client.query(`INSERT INTO bot_visit_log(site_id,id,source,visited_at,expires_at,engine,category,reason,rule_id,path,ip_identity,ip_prefix,receipt_hash)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(site_id,source,id) DO NOTHING RETURNING id`,
 [site.id,id,source,new Date(at),new Date(at+retentionDays(site)*DAY),engine,decision.category,decision.reason,ruleId,path,identity,prefix,receipt]);
 if(inserted.rowCount)return {recorded:true};
 const previous=(await client.query('SELECT receipt_hash FROM bot_visit_log WHERE site_id=$1 AND source=$2 AND id=$3',[site.id,source,id])).rows[0];
 return previous?.receipt_hash===receipt?{recorded:false,duplicate:true}:{recorded:false,reason:'id_conflict'};
}
/** One detected collector HTTP request produces one entry, not one entry per unvalidated envelope event. */
export async function recordBotVisit(pool:Pool,input:BotVisitInput):Promise<BotVisitResult>{
 if(!input.decision.isBot)return {recorded:false,reason:'not_detected_as_bot'};
 return transaction(pool,async client=>{
  await lockSite(client,input.siteId);
  const site=(await client.query('SELECT id,salt_secret,privacy_mode,retention_days,timezone,config FROM sites WHERE id=$1',[input.siteId])).rows[0] as BotSite|undefined;
  if(!site)return {recorded:false,reason:'site_not_found'};if(site.config?.archived_at)return {recorded:false,reason:'site_archived'};
  if((site.config.excluded_ips??[]).some(cidr=>matchesCIDR(input.ip,cidr)))return {recorded:false,reason:'excluded_ip'};
  if(input.observation)await recordBotObservationInTransaction(client,site.id,site.timezone,input.decision,input.observation.ruleVersion,input.observation.declaredEvents);
  return insertVisit(client,site,input,Date.now());
 });
}
/** Independent of event aggregation leases. Call from the regular retention worker. */
export async function purgeExpiredBotVisits(pool:Pick<Pool,'query'>,now=new Date()):Promise<number>{
 const result=await pool.query(`DELETE FROM bot_visit_log b USING sites s WHERE b.site_id=s.id
  AND (b.expires_at<=$1 OR b.visited_at<$1::timestamptz-(LEAST(s.retention_days,$2)::int*interval '1 day'))`,[now,BOT_VISIT_MAX_RETENTION_DAYS]);
 return result.rowCount??0;
}
export const BOT_VISIT_COVERAGE={
 collector:'Detected requests reaching the JavaScript collection endpoint only; not the complete web-server access log.',
 server_log:'Only crawler requests explicitly forwarded by an authenticated server integration.',
 engineVerification:'user_agent_claim_only',counts:'one_detected_request_per_entry',
 excludes:['raw_ip','user_agent','payload','query','fragment','ip_identity'],
} as const;
const validSecret=(actual:string,expected:unknown)=>typeof expected==='string'&&/^[a-f0-9]{64}$/.test(expected)&&timingSafeEqual(Buffer.from(hashToken(actual),'hex'),Buffer.from(expected,'hex'));
function requireServerToken(req:FastifyRequest):string {
 if(req.headers.origin!==undefined||req.headers.cookie!==undefined)throw new HttpError(403,'server_to_server_only');
 const match=/^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(req.headers.authorization??'');
 if(!match)throw new HttpError(401,'invalid_write_key');return match[1]!;
}
function verifySignature(req:FastifyRequest,body:unknown,token:string){
 const raw=req.headers['x-baize-signature'];if(typeof raw!=='string'||!/[a-f0-9]{64}/i.test(raw)||raw.length!==64)throw new HttpError(401,'invalid_signature');
 const expected=createHmac('sha256',token).update(canonical(body)).digest();
 if(!timingSafeEqual(Buffer.from(raw,'hex'),expected))throw new HttpError(401,'invalid_signature');
}
export async function registerBotVisitLog(app:FastifyInstance,ctx:AppContext){
 const windows=new Map<string,{count:number;until:number}>();
 async function rateLimit(siteId:string){
  const now=Date.now(),key='baize:bot-log-ingest:'+siteId,current=windows.get(key);let count:number;
  if(current&&current.until>now)count=++current.count;else{windows.set(key,{count:1,until:now+60000});count=1;}
  if(windows.size>10000){for(const [key,value] of windows)if(value.until<=now)windows.delete(key);while(windows.size>10000)windows.delete(windows.keys().next().value!);}
  if(ctx.redis){let timer:ReturnType<typeof setTimeout>|undefined;
   try{const remote=Number(await Promise.race([ctx.redis.eval("local c=redis.call('INCR',KEYS[1]); if c==1 then redis.call('EXPIRE',KEYS[1],60) end; return c",1,key),
    new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('BOT_LOG_RATE_TIMEOUT')),1000);})]));
    if(Number.isSafeInteger(remote)&&remote>0)count=Math.max(count,remote);
   }catch{/* Bounded local fallback survives a cache outage. */}finally{if(timer)clearTimeout(timer);}
  }
  if(count>120)throw new HttpError(429,'rate_limited');
 }
 app.post('/api/v1/sites/:siteId/bot-visits/ingest',{bodyLimit:1024*1024},async(req,reply)=>{
  const siteId=siteIdSchema.parse((req.params as {siteId:string}).siteId),token=requireServerToken(req);
  const body=botVisitIngestSchema.parse(req.body);verifySignature(req,body,token);
  const now=Date.now();if(Math.abs(now-body.sent_at)>300000)throw new HttpError(400,'stale_request');
  const result=await transaction(ctx.pool,async client=>{
   await lockSite(client,siteId);
   const site=(await client.query('SELECT id,salt_secret,privacy_mode,retention_days,timezone,config FROM sites WHERE id=$1',[siteId])).rows[0] as BotSite|undefined;
   if(!site||!validSecret(token,site.config.write_key_hash))throw new HttpError(401,'invalid_write_key');
   if(site.config.archived_at)throw new HttpError(410,'站点已移入回收站');
   try{await rateLimit(siteId);}catch(error){if(error instanceof HttpError&&error.statusCode===429)reply.header('Retry-After','60');throw error;}
   let accepted=0,duplicates=0;const rejected:{id:string;reason:string}[]=[];
   for(const visit of body.visits){
    const rule=classifyBotUA(visit.user_agent);
    if(!rule){rejected.push({id:visit.id,reason:'not_detected_as_bot'});continue;}
    const status=await insertVisit(client,site,{siteId,ip:visit.ip,userAgent:visit.user_agent,path:visit.path,at:visit.ts,
     requestId:visit.id,source:'server_log',decision:{isBot:true,category:rule.category,reason:'ua',ruleId:rule.id,requests:1}},now);
    if(status.recorded)accepted++;else if(status.duplicate)duplicates++;else rejected.push({id:visit.id,reason:status.reason??'not_recorded'});
   }
   return {accepted,duplicates,rejected};
  });
  return reply.code(202).send({...result,coverage:BOT_VISIT_COVERAGE.server_log,engineVerification:BOT_VISIT_COVERAGE.engineVerification});
 });
 app.get('/api/v1/sites/:siteId/bot-visits',async req=>{
  const siteId=siteIdSchema.parse((req.params as {siteId:string}).siteId);await ctx.authorize(req,siteId);
  const q=botVisitWindowSchema.parse(req.query);
  return transaction(ctx.pool,async client=>{
   await lockSite(client,siteId);
   const site=(await client.query('SELECT id,privacy_mode,retention_days,timezone,config FROM sites WHERE id=$1',[siteId])).rows[0] as BotSite|undefined;
   if(!site)throw new HttpError(404,'站点不存在');
   if(site.config.archived_at)throw new HttpError(410,'站点已移入回收站');
   const params=[siteId,q.from,q.to,site.timezone,q.engine??null,q.source??null,retentionDays(site)];
   const where=`site_id=$1 AND visited_at>=($2::date::timestamp AT TIME ZONE $4)
    AND visited_at<(($3::date+1)::timestamp AT TIME ZONE $4) AND expires_at>now()
    AND visited_at>=now()-($7::int*interval '1 day') AND ($5::text IS NULL OR engine=$5) AND ($6::text IS NULL OR source=$6)`;
   const totals=(await client.query(`SELECT count(*)::int visits,count(ip_identity)::int known_ip_visits,count(DISTINCT ip_identity)::int ips,count(DISTINCT path)::int urls,max(visited_at) last_seen FROM bot_visit_log WHERE ${where}`,params)).rows[0];
   const summary=(await client.query(`SELECT engine,category,count(*)::int visits,count(ip_identity)::int known_ip_visits,count(DISTINCT ip_identity)::int ips,count(DISTINCT path)::int urls,max(visited_at) last_seen
    FROM bot_visit_log WHERE ${where} GROUP BY engine,category ORDER BY visits DESC,engine,category`,params)).rows;
   // Group actual records by site-calendar day; do not add daily distinct IPs.
   const trend=(await client.query(`SELECT to_char(visited_at AT TIME ZONE $4,'YYYY-MM-DD') AS "day",engine,
    count(*)::int visits,count(ip_identity)::int known_ip_visits,count(DISTINCT ip_identity)::int ips,count(DISTINCT path)::int urls
    FROM bot_visit_log WHERE ${where} GROUP BY 1,engine ORDER BY 1,engine`,params)).rows;
   const rows=(await client.query(`SELECT id,source,visited_at,engine,category,reason,rule_id,path,ip_prefix FROM bot_visit_log WHERE ${where}
    ORDER BY visited_at DESC,id DESC,source LIMIT $8 OFFSET $9`,[...params,q.limit,(q.page-1)*q.limit])).rows;
   const privacy=site.privacy_mode==='daily_salt';
   // Historical/restored data may predate the mode guard. Missing identities
   // are unknown, not zero; daily-salt responses never reveal retained prefixes.
   const metrics=(row:Record<string,unknown>)=>{const {known_ip_visits:known,...visible}=row;return {...visible,...summarizeIPIdentities(Number(row.visits),Number(known),Number(row.ips),privacy)};};
   const publicTotals=metrics(totals);
   return {from:q.from,to:q.to,timezone:site.timezone,page:q.page,limit:q.limit,total:totals.visits,
    pages:Math.ceil(totals.visits/q.limit),rows:privacy?rows.map(row=>({...row,ip_prefix:null})):rows,totals:publicTotals,
    summary:summary.map(metrics),trend:trend.map(metrics),ipStatus:publicTotals.ipStatus,ipCoverage:publicTotals.ipCoverage,knownIps:publicTotals.knownIps,
    coverage:BOT_VISIT_COVERAGE,retentionDays:retentionDays(site)};
  });
 });
}
