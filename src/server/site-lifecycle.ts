import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {load} from 'cheerio';
import type {AppContext} from './context.js';
import {transaction,lockSite} from './db.js';
import {HttpError} from './security.js';
import {safeFetch,type Transport} from './outbound.js';
import {siteAllowsOrigin} from './site-hosts.js';

export function inspectTrackerMarkup(html:string,pageUrl:string,siteId:string,apiOrigin:string){
 const document=load(html),scripts=document('script[data-site-id]').toArray();
 const matches=scripts.filter(node=>{const element=document(node);if(element.attr('data-site-id')!==siteId)return false;try{const script=new URL(element.attr('src')||'',pageUrl),host=new URL(element.attr('data-api-host')||script.origin,pageUrl);return script.origin===apiOrigin&&/^\/tracker(?:(?:\.|-)min)?\.js$/.test(script.pathname)&&host.origin===apiOrigin;}catch{return false;}});
 return {found:matches.length>0,matchingScripts:matches.length,otherSiteScripts:scripts.length-matches.length};
}
export async function registerSiteLifecycle(app:FastifyInstance,ctx:AppContext,transport:Transport=safeFetch){
 // The recycle bin preserves historical data and stops all site API access,
 // including bearer-token reads and public tracker configuration.
 app.addHook('preHandler',async req=>{const id=(req.params as {siteId?:unknown}|undefined)?.siteId;if(typeof id!=='string'||id.length>128||req.routeOptions.url==='/api/v1/sites/:siteId/restore')return;const found=await ctx.pool.query("SELECT 1 FROM sites WHERE id=$1 AND config->>'archived_at' IS NOT NULL",[id]);if(found.rowCount)throw new HttpError(410,'站点已移入回收站，请先恢复');});
 app.get('/api/v1/archived-sites',async req=>{const user=await ctx.user(req);if(req.headers.authorization)throw new HttpError(403,'请使用站点所有者会话');return {sites:(await ctx.pool.query("SELECT s.id,s.name,s.domain,s.config->>'archived_at' archived_at FROM sites s LEFT JOIN site_members m ON m.site_id=s.id AND m.user_id=$1 WHERE s.config->>'archived_at' IS NOT NULL AND ($2 OR m.role='owner') ORDER BY s.config->>'archived_at' DESC",[user.id,user.is_admin])).rows};});
 for(const restore of [false,true])app.route({method:restore?'POST':'DELETE',url:`/api/v1/sites/:siteId${restore?'/restore':''}`,handler:async req=>{
  const id=z.string().min(1).max(128).parse((req.params as {siteId:string}).siteId),user=await ctx.user(req);if(req.headers.authorization)throw new HttpError(403,'请使用站点所有者会话');
  const body=z.object({confirmName:z.string().min(1).max(128)}).strict().parse(req.body);
  return transaction(ctx.pool,async client=>{await lockSite(client,id);const found=(await client.query('SELECT s.id,s.name,s.config,m.role FROM sites s LEFT JOIN site_members m ON m.site_id=s.id AND m.user_id=$2 WHERE s.id=$1',[id,user.id])).rows[0];if(!found)throw new HttpError(404,'站点不存在');if(!user.is_admin&&found.role!=='owner')throw new HttpError(403,'只有站点所有者可以移除或恢复站点');if(body.confirmName!==found.name)throw new HttpError(400,'请输入完整站点名称');
   if(restore){await client.query("UPDATE sites SET config=config-'archived_at' WHERE id=$1",[id]);}
   else{await client.query("UPDATE sites SET config=config||jsonb_build_object('archived_at',now()::text) WHERE id=$1",[id]);await client.query('UPDATE share_links SET revoked=true WHERE site_id=$1',[id]);await client.query('UPDATE api_tokens SET revoked=true WHERE site_id=$1',[id]);await client.query('UPDATE report_schedules SET enabled=false WHERE site_id=$1',[id]);await client.query("UPDATE notification_jobs SET status='revoked',lease_until=NULL,last_error='site_archived' WHERE site_id=$1 AND status IN ('pending','running')",[id]);}
   await client.query('INSERT INTO audit_logs(actor_id,site_id,action,target) VALUES($1,$2,$3,$4)',[user.id,id,restore?'site.restore':'site.archive',JSON.stringify({name:found.name})]);return {ok:true,archived:!restore};
  });
 }});
 app.post('/api/v1/sites/:siteId/installation-check',async req=>{const id=(req.params as {siteId:string}).siteId;await ctx.authorize(req,id,'admin');const body=z.object({url:z.url().max(2048)}).strict().parse(req.body),site=(await ctx.pool.query('SELECT id,domain,config,last_event_at FROM sites WHERE id=$1',[id])).rows[0];const target=new URL(body.url);if(target.protocol!=='https:'||target.username||target.password||!siteAllowsOrigin(site,target.origin))throw new HttpError(400,'请输入本站或已授权域名的 HTTPS 页面');target.hash='';const result=await transport(target.href,{allowedOrigin:target.origin,maxBytes:2_000_000,timeoutMs:10000});if(result.status!==200)throw new HttpError(422,`页面返回 HTTP ${result.status}，未完成代码检查`);const inspected=inspectTrackerMarkup(result.text,target.href,id,new URL(ctx.config.publicUrl).origin);return {...inspected,url:target.href,checkedAt:new Date().toISOString(),lastEventAt:site.last_event_at??null,scope:'html_source',message:inspected.found?'页面源码中找到本站追踪代码；实际执行和收包请结合采集状态确认。':'页面源码中未找到匹配代码。若代码由标签管理器或 JavaScript 注入，请结合浏览器与采集状态检查。'};});
}
