import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {AppContext} from './context.js';
import {transaction,lockSite} from './db.js';
import {ipFilterSchema,normalizeIPFilter} from './ip-filter.js';
function entries(config:Record<string,unknown>){const timestamps=(config.ip_filter_added_at||{}) as Record<string,string>;return (Array.isArray(config.excluded_ips)?config.excluded_ips:[]).map(value=>({value:String(value),kind:String(value).includes('-')?'range':String(value).includes('/')?'cidr':'ip',addedAt:timestamps[String(value)]||null}));}
export function registerIPFilterManagement(app:FastifyInstance,ctx:AppContext){
 const base='/api/v1/sites/:siteId/ip-filters';
 app.get(base,async req=>{const{siteId}=req.params as{siteId:string};await ctx.authorize(req,siteId,'admin');const site=(await ctx.pool.query('SELECT config FROM sites WHERE id=$1',[siteId])).rows[0];if(!site)throw Object.assign(Error('站点不存在'),{statusCode:404});return {rules:entries(site.config),limit:100};});
 for(const method of ['POST','DELETE'] as const)app.route({method,url:base,handler:async req=>{const{siteId}=req.params as{siteId:string},user=await ctx.authorize(req,siteId,'admin'),{value}=z.object({value:method==='POST'?ipFilterSchema:z.string().min(1).max(128)}).strict().parse(req.body);return transaction(ctx.pool,async client=>{await lockSite(client,siteId);const site=(await client.query('SELECT config FROM sites WHERE id=$1 FOR UPDATE',[siteId])).rows[0];if(!site)throw Object.assign(Error('站点不存在'),{statusCode:404});const config=site.config as Record<string,unknown>,old=entries(config).map(rule=>rule.value),timestamps={...((config.ip_filter_added_at||{}) as Record<string,string>)};let rules:string[];
  const normalized=(input:string)=>{try{return normalizeIPFilter(input);}catch{return input;}};
  if(method==='POST'){rules=old.some(rule=>normalized(rule)===value)?old:[...old,value];if(rules.length>100)throw Object.assign(Error('最多100条IP过滤规则'),{statusCode:400});if(!old.some(rule=>normalized(rule)===value))timestamps[value]=new Date().toISOString();}else{rules=old.filter(rule=>{const remove=rule===value||normalized(rule)===normalized(value);if(remove)delete timestamps[rule];return !remove;});}
  await client.query("UPDATE sites SET config=config||$2::jsonb WHERE id=$1",[siteId,JSON.stringify({excluded_ips:rules,ip_filter_added_at:timestamps})]);await client.query('INSERT INTO audit_logs(actor_id,site_id,action,target) VALUES($1,$2,$3,$4)',[user.id,siteId,method==='POST'?'ip_filter.add':'ip_filter.remove',JSON.stringify({value})]);return {rules:entries({excluded_ips:rules,ip_filter_added_at:timestamps}),limit:100};});}});
}
