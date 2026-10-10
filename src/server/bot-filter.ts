import {createHmac,randomUUID} from 'node:crypto';
import type Redis from 'ioredis';
import defaults from './bot-rules.json' with {type:'json'};
export interface BotRule {id:string;category:'ai'|'bot';tokens:string[]}
export interface BotRuleLibrary {version:number;rules:BotRule[]}
export interface BotDecision {isBot:boolean;category:'ai'|'bot'|null;reason:'ua'|'request_burst'|null;ruleId?:string;requests:number}
/** Literal tokens avoid operator-supplied regex backtracking. AI rules must precede generic rules. */
export function validateBotRules(value:unknown):BotRuleLibrary {
 const library=value as BotRuleLibrary;if(!library||!Number.isSafeInteger(library.version)||library.version<1||!Array.isArray(library.rules)||library.rules.length>200)throw Error('Invalid bot rule library');const seen=new Set<string>();
 for(const rule of library.rules){if(!rule||typeof rule.id!=='string'||!rule.id||rule.id.length>64||seen.has(rule.id)||!['ai','bot'].includes(rule.category)||!Array.isArray(rule.tokens)||!rule.tokens.length||rule.tokens.length>50||rule.tokens.some(token=>typeof token!=='string'||token.length<3||token.length>128))throw Error('Invalid bot rule');seen.add(rule.id);}
 return {version:library.version,rules:library.rules.map(rule=>({...rule,tokens:rule.tokens.map(token=>token.toLowerCase())}))};
}
export function classifyBotUA(userAgent:string,library:BotRuleLibrary=validateBotRules(defaults)){
 const ua=userAgent.slice(0,8192).toLowerCase();const matches=library.rules.filter(rule=>rule.tokens.some(token=>ua.includes(token)));return matches.find(rule=>rule.category==='ai')??matches[0]??null;
}
const burstScript=`local now=redis.call('TIME'); local ms=tonumber(now[1])*1000+math.floor(tonumber(now[2])/1000); redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',ms-1000); redis.call('ZADD',KEYS[1],ms,ARGV[1]); local n=redis.call('ZCARD',KEYS[1]); redis.call('PEXPIRE',KEYS[1],1100); return n`;
/** IP exists only during this call; neither memory nor Redis keys contain the raw IP. Count HTTP requests, never envelope events. */
export function createBotFilter(redis:Pick<Redis,'eval'>|null=null,library:BotRuleLibrary=validateBotRules(defaults)){
 const rules=validateBotRules(library),windows=new Map<string,number[]>();let checks=0;
 return {async inspect(input:{siteId:string;secret:string;ip:string;userAgent:string;now?:number}):Promise<BotDecision>{
  const key='baize:bot-burst:'+createHmac('sha256',input.secret).update('bot-burst\0'+input.siteId+'\0'+input.ip).digest('hex');let requests:number;
  {const now=input.now??Date.now();let times=(windows.get(key)??[]).filter(time=>time>now-1000);times.push(now);if(times.length>21)times=times.slice(-21);windows.delete(key);windows.set(key,times);requests=times.length;
   if(++checks%100===0||windows.size>10000){for(const [k,v] of windows)if(v[v.length-1]<=now-1000)windows.delete(k);while(windows.size>10000)windows.delete(windows.keys().next().value!);}
  }
  if(redis){try{requests=Number(await redis.eval(burstScript,1,key,randomUUID()));}catch{/* Cache outage keeps the bounded local window active; never logs IP or Redis errors. */}}
  const rule=classifyBotUA(input.userAgent,rules);if(rule)return {isBot:true,category:rule.category,reason:'ua',ruleId:rule.id,requests};
  return requests>20?{isBot:true,category:'bot',reason:'request_burst',requests}:{isBot:false,category:null,reason:null,requests};
 },ruleVersion:rules.version};
}
