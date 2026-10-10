import { z } from 'zod';
export const propertySchema=z.union([z.string().max(2048),z.number().finite(),z.boolean()]);
export const eventSchema=z.object({
  event_id:z.uuid(),type:z.enum(['pageview','event','heartbeat','vitals','revenue','identify','replay','heatmap','consent']),
  ts:z.number().int().min(0).max(8640000000000000),visitor_id:z.uuid().nullable(),page_id:z.uuid(),
  url:z.url().max(4096).refine(s=>/^https?:\/\//.test(s),'HTTP URL required'),path:z.string().max(2048).startsWith('/'),
  referrer:z.string().max(4096).optional(),title:z.string().max(512).optional(),
  utm_source:z.string().max(256).optional(),utm_medium:z.string().max(256).optional(),utm_campaign:z.string().max(256).optional(),utm_term:z.string().max(256).optional(),utm_content:z.string().max(256).optional(),
  event_name:z.string().min(1).max(128).optional(),props:z.record(z.string().max(64),propertySchema).refine(p=>Object.keys(p).length<=20,'Maximum 20 properties').optional(),
  visible_ms:z.number().int().min(0).max(86400000).optional(),interval_start:z.number().int().optional(),interval_end:z.number().int().optional(),replay_seq:z.number().int().nonnegative().optional(),
  vitals:z.object({lcp:z.number().nonnegative().optional(),inp:z.number().nonnegative().optional(),cls:z.number().nonnegative().optional(),fcp:z.number().nonnegative().optional(),ttfb:z.number().nonnegative().optional()}).optional(),
  revenue:z.number().finite().nonnegative().max(1e12).optional(),currency:z.string().regex(/^[A-Z]{3}$/).optional(),order_id:z.string().max(128).optional(),user_id:z.string().min(1).max(256).optional(),
  screen:z.string().max(64).optional(),language:z.string().max(64).optional(),replay:z.array(z.unknown()).max(500).optional(),heatmap:z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),kind:z.enum(['click','scroll']),width:z.number().positive().optional(),height:z.number().positive().optional()}).optional()
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
