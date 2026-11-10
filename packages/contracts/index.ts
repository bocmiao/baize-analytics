import { z } from 'zod';
export const VITAL_KEYS=['lcp','inp','cls','fcp','ttfb'] as const;
export const vitalKeySchema=z.enum(VITAL_KEYS);
export const channelSchema=z.enum(['direct','referral','search','social','ai','paid','email']);
export const referrerHostSchema=z.string().max(253).trim().toLowerCase().refine(s=>/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(s)&&!s.includes('..'),'请输入不含协议、路径、通配符的域名');
export const channelRuleSchema=z.object({name:z.string().min(1).max(80),channel:channelSchema,referrer_host:referrerHostSchema.optional(),include_subdomains:z.boolean().default(false),utm_medium:z.string().min(1).max(256).optional(),utm_source:z.string().min(1).max(256).optional()}).strict().refine(r=>Boolean(r.referrer_host||r.utm_medium||r.utm_source),'至少需要一个来源条件');
export const VITAL_THRESHOLDS={lcp:{good:2500,poor:4000},inp:{good:200,poor:500},cls:{good:0.1,poor:0.25},fcp:{good:1800,poor:3000},ttfb:{good:800,poor:1800}} as const;
export const suggestionStatusSchema=z.enum(['new','accepted','in-progress','pending-recheck','verified','false-positive']);
export const suggestionTransitions:Record<z.infer<typeof suggestionStatusSchema>,readonly z.infer<typeof suggestionStatusSchema>[]>= {
  new:['accepted','false-positive'],accepted:['in-progress','false-positive'],'in-progress':['pending-recheck','false-positive'],'pending-recheck':['in-progress','verified','false-positive'],verified:[], 'false-positive':['new']
};
export const propertySchema=z.union([z.string().max(2048),z.number().finite(),z.boolean()]);
export const eventSchema=z.object({
  event_id:z.uuid(),type:z.enum(['pageview','event','heartbeat','vitals','revenue','identify','replay','heatmap','consent']),
  ts:z.number().int().min(0).max(8640000000000000),visitor_id:z.uuid().nullable(),page_id:z.uuid(),
  url:z.url().max(4096).refine(s=>/^https?:\/\//.test(s),'HTTP URL required'),path:z.string().max(2048).startsWith('/'),
  referrer:z.string().max(4096).optional(),title:z.string().max(512).optional(),
  ad_click_source:z.enum(['google','meta','both']).optional(),utm_source:z.string().max(256).optional(),utm_medium:z.string().max(256).optional(),utm_campaign:z.string().max(256).optional(),utm_term:z.string().max(256).optional(),utm_content:z.string().max(256).optional(),
  event_name:z.string().min(1).max(128).optional(),props:z.record(z.string().max(64),propertySchema).refine(p=>Object.keys(p).length<=20,'Maximum 20 properties').optional(),
  visible_ms:z.number().int().min(0).max(86400000).optional(),interval_start:z.number().int().optional(),interval_end:z.number().int().optional(),replay_seq:z.number().int().nonnegative().optional(),
  vitals:z.partialRecord(vitalKeySchema,z.number().nonnegative()).optional(),
  revenue:z.number().finite().nonnegative().max(1e12).optional(),currency:z.string().regex(/^[A-Z]{3}$/).optional(),order_id:z.string().min(1).max(128).optional(),user_id:z.string().min(1).max(256).optional(),
  screen:z.string().max(64).optional(),color_depth:z.number().int().min(1).max(64).optional(),device_pixel_ratio:z.number().finite().min(0.1).max(16).optional(),language:z.string().max(64).optional(),replay:z.array(z.unknown()).max(500).optional(),heatmap:z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),kind:z.enum(['click','scroll']),width:z.number().positive().optional(),height:z.number().positive().optional()}).optional()
}).superRefine((e,c)=>{
  const require=(key:keyof typeof e)=>{if(e[key]===undefined)c.addIssue({code:'custom',path:[key],message:`${key} required for ${e.type}`});};
  if(e.type==='event')require('event_name');
  if(e.type==='heartbeat'){require('visible_ms');if(e.interval_start!==undefined&&e.interval_end!==undefined&&(e.interval_end<e.interval_start||(e.visible_ms??0)>e.interval_end-e.interval_start))c.addIssue({code:'custom',path:['visible_ms'],message:'Invalid visible interval'});}
  if(e.type==='vitals')require('vitals');if(e.type==='identify')require('user_id');if(e.type==='revenue'){require('revenue');require('currency');require('order_id');}
  if(e.type==='replay')require('replay');if(e.type==='heatmap')require('heatmap');
});
export const envelopeSchema=z.object({protocol_version:z.literal(1),site_id:z.string().min(1).max(128),sdk:z.string().max(64),sent_at:z.number().int(),events:z.array(z.unknown()).min(1).max(50)});
export type WireEvent=z.infer<typeof eventSchema>;
export type Envelope=z.infer<typeof envelopeSchema>;
export const protocolVersion=1;
