import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {AppContext} from './context.js';
import {transaction,lockSite} from './db.js';
import {HttpError} from './security.js';

export const EVENT_DEFINITION_LIMIT=100;
const eventName=z.string().min(1).max(128).refine(value=>value.trim()===value&&!/[\u0000-\u001f\u007f]/.test(value)&&!['__proto__','prototype','constructor'].includes(value),'事件标识不能包含首尾空格、控制字符或保留名称');
const metadata={displayName:z.string().trim().min(1).max(128),description:z.string().trim().max(1000)};
const createSchema=z.object({name:eventName,...metadata,description:metadata.description.default('')}).strict();
const updateSchema=z.object(metadata).partial().strict().refine(value=>Object.keys(value).length>0,'至少修改一项');
const definitionSchema=createSchema.extend({createdAt:z.iso.datetime(),updatedAt:z.iso.datetime()});
export const eventDefinitionsSchema=z.record(z.string(),definitionSchema).refine(value=>Object.keys(value).length<=EVENT_DEFINITION_LIMIT);
export type EventDefinition=z.infer<typeof definitionSchema>;

/** Metadata only: defining, renaming, or removing a definition never discards
 * collected events or changes the SDK event_name identity. */
export function readEventDefinitions(config:unknown):EventDefinition[]{
 const value=config&&typeof config==='object'?(config as Record<string,unknown>).event_definitions:null;
 if(!value||typeof value!=='object'||Array.isArray(value))return [];
 return Object.entries(value).flatMap(([name,entry])=>{const parsed=definitionSchema.safeParse(entry);return parsed.success&&parsed.data.name===name?[parsed.data]:[];}).sort((a,b)=>a.name.localeCompare(b.name));
}

export async function registerEventManagement(app:FastifyInstance,ctx:AppContext){
 const base='/api/v1/sites/:siteId/event-definitions';
 app.get(base,async request=>{
  const {siteId}=request.params as {siteId:string};await ctx.authorize(request,siteId,'read');
  const found=await ctx.pool.query('SELECT config FROM sites WHERE id=$1',[siteId]);if(!found.rows[0])throw new HttpError(404,'站点不存在');
  return {definitions:readEventDefinitions(found.rows[0].config),limit:EVENT_DEFINITION_LIMIT};
 });
 app.post(base,async(request,reply)=>{
  const {siteId}=request.params as {siteId:string},user=await ctx.authorize(request,siteId,'admin'),body=createSchema.parse(request.body);
  const definition=await mutate(siteId,user.id,body.name,'create',body);reply.code(201);return {definition};
 });
 app.patch(base+'/:eventName',async request=>{
  const {siteId,eventName:name}=request.params as {siteId:string;eventName:string},user=await ctx.authorize(request,siteId,'admin');
  eventName.parse(name);const body=updateSchema.parse(request.body);return {definition:await mutate(siteId,user.id,name,'update',body)};
 });
 app.delete(base+'/:eventName',async(request,reply)=>{
  const {siteId,eventName:name}=request.params as {siteId:string;eventName:string},user=await ctx.authorize(request,siteId,'admin');
  eventName.parse(name);await mutate(siteId,user.id,name,'delete');return reply.code(204).send();
 });
 async function mutate(siteId:string,actor:string,name:string,action:'create'|'update'|'delete',body?:{displayName?:string;description?:string}){
  return transaction(ctx.pool,async client=>{
   await lockSite(client,siteId);const row=(await client.query('SELECT config FROM sites WHERE id=$1 FOR UPDATE',[siteId])).rows[0];if(!row)throw new HttpError(404,'站点不存在');
   const definitions=Object.fromEntries(readEventDefinitions(row.config).map(definition=>[definition.name,definition])),exists=Object.hasOwn(definitions,name);
   if(action==='create'&&exists)throw new HttpError(409,'该事件标识已有定义');
   if(action!=='create'&&!exists)throw new HttpError(404,'事件定义不存在');
   if(action==='create'&&Object.keys(definitions).length>=EVENT_DEFINITION_LIMIT)throw new HttpError(409,`每个站点最多配置 ${EVENT_DEFINITION_LIMIT} 个事件定义`);
   const now=new Date().toISOString(),definition=action==='delete'?definitions[name]!:{name,displayName:body?.displayName??definitions[name]?.displayName??name,description:body?.description??definitions[name]?.description??'',createdAt:definitions[name]?.createdAt??now,updatedAt:now};
   if(action==='delete')delete definitions[name];else definitions[name]=definition;
   await client.query("UPDATE sites SET config=jsonb_set(COALESCE(config,'{}'::jsonb),'{event_definitions}',$2::jsonb,true) WHERE id=$1",[siteId,JSON.stringify(definitions)]);
   await client.query('INSERT INTO audit_logs(actor_id,site_id,action,target) VALUES($1,$2,$3,$4)',[actor,siteId,`event_definition.${action}`,JSON.stringify({name,fields:action==='delete'?[]:Object.keys(body||{})})]);
   return definition;
  });
 }
}
