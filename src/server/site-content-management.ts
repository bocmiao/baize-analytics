import type {FastifyInstance} from 'fastify';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {AppContext} from './context.js';
import {transaction,lockSite} from './db.js';
import {HttpError} from './security.js';
import {campaignInputSchema,buildCampaignUrl,utmFields,type CampaignInput} from '../../packages/contracts/campaign.js';

const text=(max:number)=>z.string().trim().min(1).max(max).refine(value=>!/[\u0000-\u001f\u007f]/.test(value),'不能包含控制字符');
const directoryPath=text(1024).refine(value=>value.startsWith('/')&&!value.startsWith('//')&&!/[?#\\]/.test(value),'请输入以 / 开头且不含查询参数或锚点的页面路径').transform(value=>new URL(value,'https://directory.invalid').pathname);
const directoryInput=z.object({name:text(100),path:directoryPath,match:z.enum(['exact','prefix']),enabled:z.boolean().default(true)}).strict();
const timestamps={id:z.uuid(),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime()};
const directorySchema=directoryInput.extend(timestamps);
const campaignSchema=campaignInputSchema.extend({...timestamps,url:z.string().url().max(2000).refine(value=>/^https?:\/\//.test(value),'无效推广链接')});
const parameterInput=z.object({field:z.enum(utmFields),value:text(128)}).strict();
const parameterSchema=parameterInput.extend({id:z.uuid(),createdAt:z.iso.datetime()});
export type DirectoryRule=z.infer<typeof directorySchema>;
export type CampaignLink=z.infer<typeof campaignSchema>;
export type CampaignParameter=z.infer<typeof parameterSchema>;
export const siteContentLimits={directory_rules:100,campaign_links:200,campaign_parameters:500} as const;
type ResourceKey=keyof typeof siteContentLimits;
const definitions={directory_rules:directorySchema,campaign_links:campaignSchema,campaign_parameters:parameterSchema};
export const siteContentConfigSchemas:Record<string,z.ZodType>={directory_rules:z.array(directorySchema).max(siteContentLimits.directory_rules),campaign_links:z.array(campaignSchema).max(siteContentLimits.campaign_links),campaign_parameters:z.array(parameterSchema).max(siteContentLimits.campaign_parameters)};

function readResource<K extends ResourceKey>(config:unknown,key:K):z.infer<(typeof definitions)[K]>[]{
 const raw=config&&typeof config==='object'?(config as Record<string,unknown>)[key]:undefined;
 if(!Array.isArray(raw))return [];
 const seen=new Set<string>();
 return raw.slice(0,siteContentLimits[key]).flatMap(value=>{const parsed=definitions[key].safeParse(value);if(!parsed.success||seen.has(parsed.data.id))return [];seen.add(parsed.data.id);return [parsed.data as z.infer<(typeof definitions)[K]>];});
}
export const readDirectoryRules=(config:unknown):DirectoryRule[]=>readResource(config,'directory_rules');
export const readCampaignLinks=(config:unknown):CampaignLink[]=>readResource(config,'campaign_links');
export const readCampaignParameters=(config:unknown):CampaignParameter[]=>readResource(config,'campaign_parameters');
/** Independent directories may overlap; each directory counts its own unique identities. */
export function directoryLabels(path:string,rules:readonly DirectoryRule[]=[]):string[]{
 const clean=path.split(/[?#]/)[0]||'/',enabled=rules.filter(rule=>rule.enabled);
 if(!enabled.length){const parts=clean.split('/').filter(Boolean);return [parts.length>1?'/'+parts.slice(0,-1).join('/')+'/':'/'];}
 const found=enabled.filter(rule=>{const prefix=rule.path==='/'?'/':rule.path.replace(/\/+$/,'');return rule.match==='exact'?clean===rule.path:prefix==='/'||clean===prefix||clean.startsWith(prefix+'/');}).map(rule=>rule.name);
 return found.length?[...new Set(found)]:['未分组'];
}

/** Resource metadata lives beside existing site configuration and never rewrites events. */
export async function registerSiteContentManagement(app:FastifyInstance,ctx:AppContext){
 const base='/api/v1/sites/:siteId';
 const mappings=[['directory-rules','directory_rules',directoryInput],['campaign-links','campaign_links',campaignInputSchema],['campaign-parameters','campaign_parameters',parameterInput]] as const;
 for(const [route,key,input] of mappings){
  app.get(`${base}/${route}`,async request=>{
   const {siteId}=request.params as {siteId:string};await ctx.authorize(request,siteId,'read');
   const row=(await ctx.pool.query('SELECT config FROM sites WHERE id=$1',[siteId])).rows[0];if(!row)throw new HttpError(404,'站点不存在');
   return {items:readResource(row.config,key),limit:siteContentLimits[key]};
  });
  app.post(`${base}/${route}`,async(request,reply)=>{
   const {siteId}=request.params as {siteId:string},actor=await ctx.authorize(request,siteId,'admin'),body=input.parse(request.body);
   const item=await mutate(siteId,actor.id,key,'create',undefined,body);reply.code(201);return {item};
  });
  app.patch(`${base}/${route}/:id`,async request=>{
   const {siteId,id}=request.params as {siteId:string;id:string},actor=await ctx.authorize(request,siteId,'admin');z.uuid().parse(id);
   const body=z.record(z.string(),z.unknown()).refine(value=>Object.keys(value).length>0&&Object.keys(value).every(field=>Object.hasOwn(input.shape,field)),'请只提交可修改的字段且至少修改一项').parse(request.body);
   return {item:await mutate(siteId,actor.id,key,'update',id,body)};
  });
  app.delete(`${base}/${route}/:id`,async(request,reply)=>{
   const {siteId,id}=request.params as {siteId:string;id:string},actor=await ctx.authorize(request,siteId,'admin');z.uuid().parse(id);
   await mutate(siteId,actor.id,key,'delete',id);return reply.code(204).send();
  });
 }
 async function mutate(siteId:string,actor:string,key:ResourceKey,action:'create'|'update'|'delete',id?:string,body?:Record<string,unknown>){
  return transaction(ctx.pool,async client=>{
   await lockSite(client,siteId);
   const row=(await client.query('SELECT config FROM sites WHERE id=$1 FOR UPDATE',[siteId])).rows[0];if(!row)throw new HttpError(404,'站点不存在');
   const items:Record<string,unknown>[]=readResource(row.config,key),index=items.findIndex(item=>item.id===id);
   if(action!=='create'&&index<0)throw new HttpError(404,'记录不存在');
   if(action==='create'&&items.length>=siteContentLimits[key])throw new HttpError(409,`最多保存 ${siteContentLimits[key]} 条记录`);
   const now=new Date().toISOString(),existing=index<0?undefined:items[index];
   let item:Record<string,unknown>|undefined;
   if(action==='delete')items.splice(index,1);
   else{
    const merged={...existing,...body};
    if(key==='directory_rules'){
     const value=directoryInput.parse(Object.fromEntries(['name','path','match','enabled'].map(field=>[field,merged[field]])));
     if(value.name==='未分组'||items.some(other=>other.id!==id&&other.name===value.name))throw new HttpError(409,'目录名称已存在或为保留名称');
     item={...value,id:id||randomUUID(),createdAt:existing?.createdAt||now,updatedAt:now};
    }else if(key==='campaign_links'){
     const value=campaignInputSchema.parse({name:merged.name,targetUrl:merged.targetUrl,parameters:merged.parameters});
     if(items.some(other=>other.id!==id&&other.name===value.name))throw new HttpError(409,'推广名称已存在');
     item={...value,url:buildCampaignUrl(value),id:id||randomUUID(),createdAt:existing?.createdAt||now,updatedAt:now};
     const parameters=readCampaignParameters(row.config);
     for(const field of utmFields){const value=item.parameters as CampaignInput['parameters'],entry=value[field];if(entry&&!parameters.some(parameter=>parameter.field===field&&parameter.value===entry))parameters.push({id:randomUUID(),field,value:entry,createdAt:now});}
     if(parameters.length>siteContentLimits.campaign_parameters)throw new HttpError(409,'渠道参数值已满，请先删除不用的参数值');
     await client.query("UPDATE sites SET config=jsonb_set(COALESCE(config,'{}'::jsonb),'{campaign_parameters}',$2::jsonb,true) WHERE id=$1",[siteId,JSON.stringify(parameters)]);
    }else{
     const value=parameterInput.parse({field:merged.field,value:merged.value});
     if(items.some(other=>other.id!==id&&other.field===value.field&&other.value===value.value))throw new HttpError(409,'该渠道参数值已存在');
     item={...value,id:id||randomUUID(),createdAt:existing?.createdAt||now};
    }
    if(index<0)items.push(item);else items[index]=item;
   }
   // The JSON key is from the fixed internal mappings, never a user-controlled SQL identifier.
   await client.query('UPDATE sites SET config=jsonb_set(COALESCE(config,\'{}\'::jsonb),$2::text[],$3::jsonb,true) WHERE id=$1',[siteId,[key],JSON.stringify(items)]);
   await client.query('INSERT INTO audit_logs(actor_id,site_id,action,target) VALUES($1,$2,$3,$4)',[actor,siteId,`${key}.${action}`,JSON.stringify({id:item?.id||id,fields:Object.keys(body||{})})]);
   return item;
  });
 }
}
