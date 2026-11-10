import {createHmac} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import type {AppContext} from './context.js';
import {requireAdminSession} from './auth.js';
export type RequestBudget='authenticated'|'public';
export interface RequestRateLimitOptions{authenticatedLimit?:number;publicLimit?:number;windowMs?:number;maxEntries?:number;redisTimeoutMs?:number;clock?:()=>number}
/** Deliberately never includes site, query, token, body or supplied proxy headers. */
export function requestBudget(method:string,path:string):RequestBudget|null{
 // This endpoint uses a site write key, signed batches and its own per-site budget, not a user API token.
 if(method==='POST'&&/^\/api\/v1\/sites\/[^/]+\/bot-visits\/ingest$/.test(path))return null;
 if((method==='POST'&&/^\/api\/v1\/shares\/[^/]+$/.test(path))||(['GET','HEAD'].includes(method)&&path==='/embed/chart'))return 'public';
 if(path==='/api/stats'||/^\/api\/(?:v1\/)?sites(?:\/|$)/.test(path)||/^\/api\/admin(?:\/|$)/.test(path))return 'authenticated';
 return null;
}
const incrementScript="local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end;return n";
export function registerRequestRateLimits(app:FastifyInstance,ctx:AppContext,options:RequestRateLimitOptions={}){
 const windowMs=options.windowMs??60000,maxEntries=options.maxEntries??10000,timeout=options.redisTimeoutMs??1000,clock=options.clock??Date.now;
 const limits={authenticated:options.authenticatedLimit??600,public:options.publicLimit??120};
 for(const n of [windowMs,maxEntries,timeout,...Object.values(limits)])if(!Number.isSafeInteger(n)||n<=0)throw new Error('INVALID_REQUEST_RATE_LIMIT_CONFIG');
 const entries=new Map<string,{window:number;count:number}>();let inFlight=0;
 app.addHook('preHandler',async(req,reply)=>{
  const path=req.url.split('?')[0]!;const budget=requestBudget(req.method,path);if(!budget)return;
  const subject=budget==='authenticated'?(await (/^\/api\/admin(?:\/|$)/.test(path)?requireAdminSession(ctx,req):ctx.user(req))).id:req.ip;
  const digest=createHmac('sha256',ctx.config.masterKey).update('baize-request-budget-v1\0'+budget+'\0'+subject).digest('hex');
  const now=clock(),window=Math.floor(now/windowMs),remaining=windowMs-now%windowMs,retry=Math.max(1,Math.ceil(remaining/1000));
  const unavailable=()=>reply.code(503).header('Retry-After',String(retry)).send({error:'request_rate_limit_unavailable',message:'请求额度服务暂不可用，请稍后重试'});
  let count:number;
  if(ctx.redis){
   if(inFlight>=256)return unavailable();
   inFlight++;let timer:ReturnType<typeof setTimeout>|undefined;
   try{const operation=Promise.resolve().then(()=>ctx.redis!.eval(incrementScript,1,`baize:request-limit:v1:${budget}:${window}:${digest}`,remaining)).finally(()=>{inFlight--;});const result=await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('REQUEST_RATE_LIMIT_TIMEOUT')),timeout);})]);count=Number(result);if(!Number.isSafeInteger(count)||count<=0)return unavailable();}
   catch{return unavailable();}finally{if(timer)clearTimeout(timer);}
  }else{
   for(const [key,value]of entries)if(value.window!==window)entries.delete(key);
   const key=budget+':'+digest,entry=entries.get(key);
   if(!entry&&entries.size>=maxEntries)return unavailable();
   count=(entry?.count??0)+1;entries.set(key,{window,count});
  }
  if(count>limits[budget])return reply.code(429).header('Retry-After',String(retry)).send({error:'request_rate_limit_exceeded',message:'请求次数过多，请稍后重试'});
 });
 app.addHook('onClose',async()=>{entries.clear();});
}
