import {siteAllowsOrigin} from './site-hosts.js';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from './context.js';
import { envelopeSchema,eventSchema,type WireEvent } from '../../packages/contracts/index.js';
import { transaction,lockSite,dirtySite } from './db.js';
import { HttpError,anonymizeIP,matchesCIDR,visitorHash,canonical,hashToken,dayScopedPageId } from './security.js';
import { createHash,createHmac,randomUUID,timingSafeEqual } from 'node:crypto';
import {sanitizePrivacyProps} from '../../packages/tracker/src/privacy.js';
import {checkIdentity,registerIdentity} from './identity.js';
import { ingestGovernance } from './governance.js';
import {eventDimensions as dimensions} from './dimensions.js';
import {createBotFilter} from './bot-filter.js';
export {dimensions};
function cleanEvent(event:WireEvent,ip:string,privacy=false){
  const out={...event};const url=new URL(event.url);url.search='';url.hash='';out.url=url.toString();
  try{const ref=new URL(out.referrer??'');ref.search='';ref.hash='';out.referrer=ref.toString();}catch{out.referrer='';}
  if(out.props){out.props=Object.fromEntries(Object.entries(out.props).filter(([k,v])=>!/(password|secret|token|email|phone|authorization|ip_address)/i.test(k)&&v!==ip));if(privacy)out.props=sanitizePrivacyProps(out.props);}
  if(privacy)delete out.user_id;
  return out;
}
export async function registerCollect(app:FastifyInstance,ctx:AppContext,geoLookup:(ip:string)=>Record<string,string>=()=>({})){
  const rate=new Map<string,{count:number,expires:number}>();
  const botFilter=createBotFilter(ctx.redis);
  app.options('/api/collect',async(req,reply)=>{reply.header('Access-Control-Allow-Origin',req.headers.origin??'*').header('Access-Control-Allow-Methods','POST').header('Access-Control-Allow-Headers','Content-Type,Authorization,X-Baize-Signature');return reply.code(204).send();});
  app.post('/api/collect',async(req,reply)=>{
    let raw=req.body as any;
    if(typeof raw==='string'){try{raw=JSON.parse(raw);}catch{throw new HttpError(400,'invalid_json');}}
    if(raw?.protocol_version!==1)return reply.code(400).send({error:'unsupported_protocol_version',supported:[1]});
    const envelope=envelopeSchema.parse(raw);const found=await ctx.pool.query('SELECT * FROM sites WHERE id=$1',[envelope.site_id]);if(!found.rowCount)throw new HttpError(404,'站点不存在');let site=found.rows[0];
    const origin=req.headers.origin;if(origin){try{new URL(origin);}catch{throw new HttpError(403,'无效来源');}if(!siteAllowsOrigin(site,origin))throw new HttpError(403,'来源不属于该站点');reply.header('Access-Control-Allow-Origin',origin).header('Vary','Origin');}
    const ip=req.ip,ua=req.headers['user-agent']??'';
    const limitKey=`baize:rate:${site.id}:${visitorHash(site.salt_secret,'rate',ip,'')}`;let count=0;
    // Maintain the local window even while Redis is healthy, so failover does not reset its history.
    const before=rate.get(limitKey);if(before&&before.expires>Date.now())count=++before.count;else{count=1;rate.set(limitKey,{count,expires:Date.now()+60000});}
    if(rate.size>10000){for(const [key,v] of rate)if(v.expires<Date.now())rate.delete(key);while(rate.size>10000)rate.delete(rate.keys().next().value!);}
    if(ctx.redis){try{count=Math.max(count,Number(await ctx.redis.eval("local c=redis.call('INCR',KEYS[1]); if c==1 then redis.call('EXPIRE',KEYS[1],60) end; return c",1,limitKey)));}catch{/* Cache failure retains bounded local intake limits; durable PG remains authoritative. */}}
    if(count>100){reply.header('Retry-After','60');throw new HttpError(429,'rate_limited');}
    const bot=await botFilter.inspect({siteId:site.id,secret:site.salt_secret,ip,userAgent:ua});
    if(bot.isBot){await ctx.pool.query('INSERT INTO bot_counts(site_id,day,category,count) VALUES($1,$2,$3,1) ON CONFLICT(site_id,day,category) DO UPDATE SET count=bot_counts.count+1',[site.id,new Intl.DateTimeFormat('en-CA',{timeZone:site.timezone}).format(new Date()),bot.category]);return reply.code(204).send();}
    if((site.config.excluded_ips??[]).some((cidr:string)=>matchesCIDR(ip,cidr)))return reply.code(204).send();
    if(req.headers.authorization){const write=site.config.write_key_hash;const token=req.headers.authorization.replace(/^Bearer /,'');if(!write||hashToken(token)!==write)throw new HttpError(401,'invalid_write_key');const signature=req.headers['x-baize-signature'];const expected=createHmac('sha256',token).update(canonical(envelope)).digest();let supplied:Buffer;try{supplied=Buffer.from(String(signature),'hex');}catch{throw new HttpError(401,'invalid_signature');}if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw new HttpError(401,'invalid_signature');}
    const geo=geoLookup(ip);const rejected:{index:number;event_id?:string;reason:string}[]=[];let duplicates=0,accepted=0,ignored=false;
    await transaction(ctx.pool,async client=>{
      await lockSite(client,site.id);
      site=(await client.query('SELECT * FROM sites WHERE id=$1',[site.id])).rows[0];if(!site)throw new HttpError(404,'站点不存在');
      if(origin){if(!siteAllowsOrigin(site,origin))throw new HttpError(403,'来源不属于该站点');}
      if((site.config.excluded_ips??[]).some((cidr:string)=>matchesCIDR(ip,cidr))){ignored=true;return;}
      if(req.headers.authorization&&hashToken(req.headers.authorization.replace(/^Bearer /,''))!==site.config.write_key_hash)throw new HttpError(401,'invalid_write_key');
      let changed=false;
      for(const [index,rawEvent] of envelope.events.entries()){
        const parsed=eventSchema.safeParse(rawEvent);if(!parsed.success){rejected.push({index,event_id:(rawEvent as any)?.event_id,reason:'invalid_event'});continue;}
        const wire=parsed.data;
        if(site.privacy_mode==='daily_salt'&&wire.type==='identify'){rejected.push({index,event_id:wire.event_id,reason:'identify_unsupported_in_daily_salt'});continue;}
        if(wire.ts>Date.now()+86400000){rejected.push({index,event_id:wire.event_id,reason:'future_event'});continue;}
        if(wire.ts<Date.now()-Number(site.retention_days)*86400000){rejected.push({index,event_id:wire.event_id,reason:'outside_retention'});continue;}
        if(wire.type==='replay'||wire.type==='heatmap'){if(site.config[wire.type]!==true){rejected.push({index,event_id:wire.event_id,reason:'feature_not_enabled'});continue;}}
        const day=new Intl.DateTimeFormat('en-CA',{timeZone:site.timezone}).format(new Date(wire.ts));
        const visitor=site.privacy_mode==='daily_salt'?visitorHash(site.salt_secret,day,ip,ua):wire.visitor_id??randomUUID();
        let userId=site.privacy_mode==='standard'&&wire.user_id?visitorHash(site.salt_secret,'identity',wire.user_id,''):undefined;
        const identity=await checkIdentity(client,site.id,visitor,wire.ts,userId??null,wire.type==='identify');if(!identity.allowed){rejected.push({index,event_id:wire.event_id,reason:identity.reason??'deleted_visitor'});continue;}
        // Hash the unmodified validated wire event, not server-derived dimensions/IP. Retry identity is stable.
        const hash=createHash('sha256').update(canonical(wire)).digest('hex');
        const existing=await client.query('SELECT hash FROM event_keys WHERE site_id=$1 AND event_id=$2',[site.id,wire.event_id]);if(existing.rowCount){if(existing.rows[0].hash!==hash)rejected.push({index,event_id:wire.event_id,reason:'event_id_conflict'});else{duplicates++;accepted++;}continue;}
        const orderHash=wire.type==='revenue'?visitorHash(site.salt_secret,site.privacy_mode==='daily_salt'?`order:${day}`:'order',wire.order_id!,''):undefined;
        if(orderHash){
          const order=await client.query('SELECT currency,amount=$3::numeric AS same_amount FROM revenue_orders WHERE site_id=$1 AND order_hash=$2',[site.id,orderHash,String(wire.revenue)]);
          if(order.rowCount){
            if(order.rows[0].currency!==wire.currency||!order.rows[0].same_amount){rejected.push({index,event_id:wire.event_id,reason:'order_id_conflict'});continue;}
            // Record an alias receipt without another event: future reuse of this event ID still observes payload-conflict policy.
            await client.query('INSERT INTO event_keys(site_id,event_id,hash,ts,visitor_id) VALUES($1,$2,$3,$4,$5)',[site.id,wire.event_id,hash,new Date(wire.ts),visitor]);duplicates++;accepted++;continue;
          }
        }
        if(wire.type==='identify'&&userId){if(!await registerIdentity(client,site.id,visitor,userId,wire.ts)){rejected.push({index,event_id:wire.event_id,reason:'identity_time_conflict'});continue;}}if(site.privacy_mode==='standard'){const resolved=await checkIdentity(client,site.id,visitor,wire.ts,userId??null);if(!resolved.allowed){rejected.push({index,event_id:wire.event_id,reason:resolved.reason??'identity_mismatch'});continue;}userId=resolved.user_id??undefined;}
        const clean=cleanEvent(wire,ip,site.privacy_mode==='daily_salt');clean.visitor_id=visitor as any;if(userId)clean.user_id=userId;if(orderHash)clean.order_id=orderHash;
        if(site.privacy_mode==='daily_salt')clean.page_id=dayScopedPageId(site.salt_secret,day,wire.page_id);
        const metadata={...dimensions(ua,wire,geo,site.config,ip),ip_truncated:site.privacy_mode==='daily_salt'?null:anonymizeIP(ip)};
        // Replay is revalidated by the governance module before raw JSON can be retained.
        if(wire.type==='replay'){
          const { replayIsMasked }=await import('./governance.js');if(!replayIsMasked(wire.replay)){rejected.push({index,event_id:wire.event_id,reason:'unmasked_replay'});continue;}
        }
        await client.query('INSERT INTO event_keys(site_id,event_id,hash,ts,visitor_id) VALUES($1,$2,$3,$4,$5)',[site.id,wire.event_id,hash,new Date(wire.ts),visitor]);
        await client.query('INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[site.id,wire.event_id,new Date(wire.ts),visitor,clean.page_id,wire.type,wire.path,JSON.stringify(clean),JSON.stringify(metadata)]);
        if(orderHash)await client.query('INSERT INTO revenue_orders(site_id,order_hash,visitor_id,event_id,ts,currency,amount,privacy_mode,order_day) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[site.id,orderHash,visitor,wire.event_id,new Date(wire.ts),wire.currency,String(wire.revenue),site.privacy_mode,site.privacy_mode==='daily_salt'?day:null]);
        await ingestGovernance(client,site,clean as unknown as Record<string,unknown>,visitor);
        for(const [key,value] of Object.entries(clean.props??{}))await client.query('INSERT INTO event_data(site_id,event_id,ts,data_key,data_type,string_value,number_value,boolean_value) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[site.id,wire.event_id,new Date(wire.ts),key,typeof value==='string'?'s':typeof value==='number'?'n':'b',typeof value==='string'?value:null,typeof value==='number'?value:null,typeof value==='boolean'?value:null]);
        // Identity projection updates happen only on event-time identify transitions.
        await client.query('INSERT INTO outbox(site_id,event_id,ts,visitor_id) VALUES($1,$2,$3,$4)',[site.id,wire.event_id,new Date(wire.ts),visitor]);changed=true;accepted++;
      }
      if(changed){await dirtySite(client,site.id);await client.query('UPDATE sites SET last_event_at=now() WHERE id=$1',[site.id]);}
    });
    if(ignored)return reply.code(204).send();
    return reply.code(202).send({accepted,duplicates,rejected,clock_skew:Math.abs(Date.now()-envelope.sent_at)>86400000});
  });
}
