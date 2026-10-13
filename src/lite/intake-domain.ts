import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {envelopeSchema,eventSchema,type WireEvent} from '../../packages/contracts/index.js';
import {sanitizePrivacyProps} from '../../packages/tracker/src/privacy.js';
import {canonical,visitorHash,dayScopedPageId,anonymizeIP,matchesCIDR,hashToken,HttpError} from '../server/security.js';
import {siteAllowsOrigin} from '../server/site-hosts.js';
import {prepareEventDimensions} from '../server/dimensions.js';
import {sanitizeDailyPayload,sanitizeDailyDimensions} from '../server/daily-privacy-policy.js';
import {classifyBotUA} from '../server/bot-filter.js';
import type {LiteCollectInput,LiteCollectResult,LiteSite,LiteWriteContext} from './types.js';
function cleanEvent(event:WireEvent,ip:string,privacy:boolean):WireEvent {
 const out={...event};const url=new URL(out.url);url.search='';url.hash='';out.url=url.toString();
 try{const ref=new URL(out.referrer??'');ref.search='';ref.hash='';out.referrer=ref.toString();}catch{out.referrer='';}
 if(out.props){out.props=Object.fromEntries(Object.entries(out.props).filter(([key,value])=>!/(password|secret|token|email|phone|authorization|ip_address)/i.test(key)&&value!==ip));if(privacy)out.props=sanitizePrivacyProps(out.props);}
 if(privacy)delete out.user_id;return out;
}
/** One owner-worker transaction: a successful response implies durable bodies, receipts and rebuild work. */
export function handleIntake(context:LiteWriteContext,kind:string,payload:Record<string,unknown>):LiteCollectResult {
 if(kind!=='intake')throw Error('unsupported_intake_command');
 const input=payload as unknown as LiteCollectInput;const envelope=envelopeSchema.parse(input.envelope);
 if(envelope.site_id!==input.siteId)throw new HttpError(400,'site_id_mismatch');
 const {db,now}=context;const result:LiteCollectResult={accepted:0,duplicates:0,rejected:[],clock_skew:Math.abs(now-envelope.sent_at)>86400000};
 db.exec('BEGIN IMMEDIATE');
 try{
  const row=db.prepare('SELECT * FROM sites WHERE id=?').get(input.siteId);if(!row)throw new HttpError(404,'站点不存在');
  const site={...row,config:JSON.parse(String(row.config))} as unknown as LiteSite;
  if(input.origin&&!siteAllowsOrigin(site,input.origin))throw new HttpError(403,'来源不属于该站点');
  // The HTTP layer must authenticate write-key envelopes. Refuse stale authorization after config changes.
  const authorization=input as LiteCollectInput & {writeKey?:string;signature?:string};
  if(site.config.write_key_hash||authorization.writeKey){
   if(!authorization.writeKey||hashToken(authorization.writeKey)!==site.config.write_key_hash)throw new HttpError(401,'invalid_write_key');
   const expected=createHmac('sha256',authorization.writeKey).update(canonical(envelope)).digest();
   const supplied=Buffer.from(authorization.signature??'','hex');
   if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw new HttpError(401,'invalid_signature');
  }
  if(classifyBotUA(input.ua)||(Array.isArray(site.config.excluded_ips)&&site.config.excluded_ips.some(cidr=>matchesCIDR(input.ip,String(cidr))))){db.exec('COMMIT');return result;}
  let changed=false;
  const receipt=db.prepare('SELECT * FROM receipts WHERE site_id=? AND event_id=?');
  const body=db.prepare('SELECT visitor_id,payload FROM events WHERE site_id=? AND event_id=?');
  const deleted=db.prepare('SELECT 1 FROM tombstones WHERE site_id=? AND (visitor_id=? OR (? IS NOT NULL AND user_id=?)) LIMIT 1');
  const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:site.timezone});
  const dimensionsFor=prepareEventDimensions(input.ua,{},site.config,input.ip);
  const insertReceipt=db.prepare('INSERT INTO receipts(site_id,event_id,wire_hash,ts,visitor_id,page_id,type,parent_event_id) VALUES(?,?,?,?,?,?,?,?)');
  const insertEvent=db.prepare('INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions) VALUES(?,?,?,?,?,?,?,?,?)');
  // Revenue statements stay lazy for batches containing no revenue.
  let findOrder:ReturnType<typeof db.prepare>|undefined,insertOrder:ReturnType<typeof db.prepare>|undefined;
  for(const raw of envelope.events){
   const parsed=eventSchema.safeParse(raw);const id=(raw&&typeof raw==='object')?(raw as {event_id?:string}).event_id:undefined;
   const reject=(reason:string)=>result.rejected.push({event_id:id,reason});
   if(!parsed.success){reject('invalid_event');continue;}const wire=parsed.data;
   if(site.privacy_mode==='daily_salt'&&wire.type==='identify'){reject('identify_unsupported_in_daily_salt');continue;}
   if(wire.type==='identify'||(site.privacy_mode==='standard'&&wire.user_id)){reject('identify_unsupported_in_lite');continue;}
   if(wire.type==='replay'||wire.type==='heatmap'){reject('feature_unsupported_in_lite');continue;}
   if(wire.ts>now+86400000){reject('future_event');continue;}
   if(wire.ts<now-Number(site.retention_days)*86400000){reject('outside_retention');continue;}
   const day=dayFormatter.format(new Date(wire.ts));
   const previous=receipt.get(site.id,wire.event_id);
   // Anonymous retries retain their original generated visitor identity.
   const visitor=site.privacy_mode==='daily_salt'?visitorHash(site.salt_secret,day,input.ip,input.ua):wire.visitor_id??(previous?String(previous.visitor_id):randomUUID());
   const user=wire.user_id?visitorHash(site.salt_secret,'identity',wire.user_id,''):null;
   if(deleted.get(site.id,visitor,user,user)){reject('deleted_visitor');continue;}
   const hash=createHash('sha256').update(canonical(wire)).digest('hex');
   if(previous){if(previous.wire_hash!==hash){reject('event_id_conflict');continue;}const original=body.get(site.id,String(previous.parent_event_id??wire.event_id));if(!original)throw Error('receipt_body_missing');if(deleted.get(site.id,String(original.visitor_id),null,null)){reject('deleted_visitor');continue;}result.accepted++;result.duplicates++;continue;}
   const orderHash=wire.type==='revenue'?visitorHash(site.salt_secret,site.privacy_mode==='daily_salt'?`order:${day}`:'order',wire.order_id!,''):undefined;
   const page=site.privacy_mode==='daily_salt'?dayScopedPageId(site.salt_secret,day,wire.page_id):wire.page_id;
   let parent:string|null=null;
   if(orderHash){findOrder??=db.prepare('SELECT * FROM revenue_orders WHERE site_id=? AND order_hash=?');const order=findOrder.get(site.id,orderHash);if(order){if(order.currency!==wire.currency||Number(order.amount)!==wire.revenue){reject('order_id_conflict');continue;}parent=String(order.event_id);const original=body.get(site.id,parent);if(!original)throw Error('receipt_body_missing');if(deleted.get(site.id,String(original.visitor_id),null,null)){reject('deleted_visitor');continue;}}}
   insertReceipt.run(site.id,wire.event_id,hash,wire.ts,visitor,page,wire.type,parent);
   if(parent){result.accepted++;result.duplicates++;continue;}
   let clean=cleanEvent(wire,input.ip,site.privacy_mode==='daily_salt');clean.visitor_id=visitor;if(orderHash)clean.order_id=orderHash;clean.page_id=page;
   let dimensions:Record<string,unknown>={...dimensionsFor(wire),ip_truncated:site.privacy_mode==='daily_salt'?null:anonymizeIP(input.ip)};
   if(site.privacy_mode==='daily_salt'){clean=sanitizeDailyPayload(clean,{visitorId:visitor,pageId:page});dimensions=sanitizeDailyDimensions(dimensions);}
   insertEvent.run(site.id,wire.event_id,wire.ts,visitor,page,wire.type,wire.path,JSON.stringify(clean),JSON.stringify(dimensions));
   if(orderHash){insertOrder??=db.prepare('INSERT INTO revenue_orders(site_id,order_hash,event_id,visitor_id,ts,currency,amount) VALUES(?,?,?,?,?,?,?)');insertOrder.run(site.id,orderHash,wire.event_id,visitor,wire.ts,wire.currency!,wire.revenue!);}
   changed=true;result.accepted++;
  }
  if(changed){const generation=Number(site.generation)+1;db.prepare('UPDATE sites SET generation=? WHERE id=?').run(generation,site.id);db.prepare("INSERT INTO jobs(id,site_id,kind,dedupe_key,status,payload,next_at,epoch,generation) VALUES(?,?,'aggregate',?,'pending','{}',?,?,?)").run(randomUUID(),site.id,String(generation),now,site.epoch,generation);}
  db.exec('COMMIT');return result;
 }catch(error){try{db.exec('ROLLBACK');}catch{/* Preserve the original commit/storage failure. */}throw error;}
}
