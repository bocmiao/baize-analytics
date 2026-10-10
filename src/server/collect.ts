import type { FastifyInstance } from 'fastify';
import type { AppContext } from './context.js';
import { envelopeSchema,eventSchema,type WireEvent } from '../../packages/contracts/index.js';
import { transaction,lockSite,dirtySite } from './db.js';
import { HttpError,anonymizeIP,matchesCIDR,visitorHash,canonical,hashToken } from './security.js';
import { createHash,createHmac,randomUUID,timingSafeEqual } from 'node:crypto';
import { ingestGovernance } from './governance.js';
export function dimensions(ua:string,event:WireEvent,geo:Record<string,string>={}){
  const ref=event.referrer??'';let host='';try{host=new URL(ref).hostname;}catch{/* No referrer. */}
  const channel=event.utm_medium==='email'?'email':/cpc|paid|ppc/.test(event.utm_medium??'')?'paid':/chatgpt|claude|perplexity|doubao|yiyan/.test(host)?'ai':/google|bing|baidu|sogou|so\.com|duckduckgo/.test(host)?'search':/weixin|wechat|weibo|facebook|twitter|t\.co|zhihu|douyin|xiaohongshu/.test(host)?'social':host?'referral':'direct';
  return {country:'unknown',region:'unknown',city:'unknown',...geo,device:/ipad|tablet/i.test(ua)?'tablet':/mobile|android|iphone/i.test(ua)?'mobile':'desktop',browser:/edg\//i.test(ua)?'Edge':/chrome|chromium/i.test(ua)?'Chrome':/firefox/i.test(ua)?'Firefox':/safari/i.test(ua)?'Safari':'unknown',os:/windows/i.test(ua)?'Windows':/android/i.test(ua)?'Android':/iphone|ipad/i.test(ua)?'iOS':/macintosh/i.test(ua)?'macOS':/linux/i.test(ua)?'Linux':'unknown',screen:event.screen??'unknown',language:event.language??'unknown',channel,referrer:host,utm_source:event.utm_source??'',utm_medium:event.utm_medium??'',utm_campaign:event.utm_campaign??''};
}
function cleanEvent(event:WireEvent,ip:string){
  const out={...event};const url=new URL(event.url);url.search='';url.hash='';out.url=url.toString();
  try{const ref=new URL(out.referrer??'');ref.search='';ref.hash='';out.referrer=ref.toString();}catch{out.referrer='';}
  if(out.props)out.props=Object.fromEntries(Object.entries(out.props).filter(([k,v])=>!/(password|secret|token|email|phone|authorization|ip_address)/i.test(k)&&v!==ip));
  return out;
}
export async function registerCollect(app:FastifyInstance,ctx:AppContext,geoLookup:(ip:string)=>Record<string,string>=()=>({})){
  const rate=new Map<string,{count:number,expires:number}>();
  app.options('/api/collect',async(req,reply)=>{reply.header('Access-Control-Allow-Origin',req.headers.origin??'*').header('Access-Control-Allow-Methods','POST').header('Access-Control-Allow-Headers','Content-Type,Authorization,X-Baize-Signature');return reply.code(204).send();});
  app.post('/api/collect',async(req,reply)=>{
    const raw=req.body as any;if(raw?.protocol_version!==1)return reply.code(400).send({error:'unsupported_protocol_version',supported:[1]});
    const envelope=envelopeSchema.parse(raw);const found=await ctx.pool.query('SELECT * FROM sites WHERE id=$1',[envelope.site_id]);if(!found.rowCount)throw new HttpError(404,'站点不存在');const site=found.rows[0];
    const origin=req.headers.origin;if(origin){let host='';try{host=new URL(origin).host;}catch{throw new HttpError(403,'无效来源');}if(host!==site.domain&&host.split(':')[0]!==site.domain)throw new HttpError(403,'来源不属于该站点');reply.header('Access-Control-Allow-Origin',origin).header('Vary','Origin');}
    const ip=req.ip,ua=req.headers['user-agent']??'';
    const limitKey=`baize:rate:${site.id}:${visitorHash(site.salt_secret,'rate',ip,'')}`;let count=0;
    if(ctx.redis){count=Number(await ctx.redis.eval("local c=redis.call('INCR',KEYS[1]); if c==1 then redis.call('EXPIRE',KEYS[1],60) end; return c",1,limitKey));}else{const before=rate.get(limitKey);if(before&&before.expires>Date.now())count=++before.count;else{count=1;rate.set(limitKey,{count,expires:Date.now()+60000});}if(rate.size>10000)for(const [key,v] of rate)if(v.expires<Date.now())rate.delete(key);}
    if(count>100){reply.header('Retry-After','60');throw new HttpError(429,'rate_limited');}
    if(/bot|crawler|spider|headless/i.test(ua)){const category=/gptbot|claudebot|google-extended/i.test(ua)?'ai':'bot';await ctx.pool.query('INSERT INTO bot_counts(site_id,day,category,count) VALUES($1,current_date,$2,1) ON CONFLICT(site_id,day,category) DO UPDATE SET count=bot_counts.count+1',[site.id,category]);return reply.code(204).send();}
    if((site.config.excluded_ips??[]).some((cidr:string)=>matchesCIDR(ip,cidr)))return reply.code(204).send();
    if(req.headers.authorization){const write=site.config.write_key_hash;const token=req.headers.authorization.replace(/^Bearer /,'');if(!write||hashToken(token)!==write)throw new HttpError(401,'invalid_write_key');const signature=req.headers['x-baize-signature'];const expected=createHmac('sha256',token).update(canonical(envelope)).digest();let supplied:Buffer;try{supplied=Buffer.from(String(signature),'hex');}catch{throw new HttpError(401,'invalid_signature');}if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw new HttpError(401,'invalid_signature');}
    const geo=geoLookup(ip);const rejected:{index:number;event_id?:string;reason:string}[]=[];let duplicates=0,accepted=0;
    await transaction(ctx.pool,async client=>{
      await lockSite(client,site.id);let changed=false;
      for(const [index,rawEvent] of envelope.events.entries()){
        const parsed=eventSchema.safeParse(rawEvent);if(!parsed.success){rejected.push({index,event_id:(rawEvent as any)?.event_id,reason:'invalid_event'});continue;}
        const wire=parsed.data;
        if(wire.ts>Date.now()+86400000){rejected.push({index,event_id:wire.event_id,reason:'future_event'});continue;}
        if(wire.ts<Date.now()-Number(site.retention_days)*86400000){rejected.push({index,event_id:wire.event_id,reason:'outside_retention'});continue;}
        if(wire.type==='replay'||wire.type==='heatmap'){if(site.config[wire.type]!==true){rejected.push({index,event_id:wire.event_id,reason:'feature_not_enabled'});continue;}}
        const day=new Intl.DateTimeFormat('en-CA',{timeZone:site.timezone}).format(new Date(wire.ts));
        const visitor=site.privacy_mode==='daily_salt'?visitorHash(site.salt_secret,day,ip,ua):wire.visitor_id??randomUUID();
        const userId=wire.user_id?visitorHash(site.salt_secret,'identity',wire.user_id,''):undefined;
        if((await client.query('SELECT 1 FROM tombstones WHERE site_id=$1 AND (visitor_id=$2 OR ($3::text IS NOT NULL AND user_id=$3))',[site.id,visitor,userId??null])).rowCount){rejected.push({index,event_id:wire.event_id,reason:'deleted_visitor'});continue;}
        // Hash the unmodified validated wire event, not server-derived dimensions/IP. Retry identity is stable.
        const hash=createHash('sha256').update(canonical(wire)).digest('hex');
        const existing=await client.query('SELECT hash FROM event_keys WHERE site_id=$1 AND event_id=$2',[site.id,wire.event_id]);if(existing.rowCount){if(existing.rows[0].hash!==hash)rejected.push({index,event_id:wire.event_id,reason:'event_id_conflict'});else{duplicates++;accepted++;}continue;}
        const clean=cleanEvent(wire,ip);clean.visitor_id=visitor as any;if(userId)clean.user_id=userId;
        const metadata={...dimensions(ua,wire,geo),ip_truncated:site.privacy_mode==='daily_salt'?null:anonymizeIP(ip)};
        // Replay is revalidated by the governance module before raw JSON can be retained.
        if(wire.type==='replay'){
          const { replayIsMasked }=await import('./governance.js');if(!replayIsMasked(wire.replay)){rejected.push({index,event_id:wire.event_id,reason:'unmasked_replay'});continue;}
        }
        await client.query('INSERT INTO event_keys(site_id,event_id,hash,ts,visitor_id) VALUES($1,$2,$3,$4,$5)',[site.id,wire.event_id,hash,new Date(wire.ts),visitor]);
        await client.query('INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[site.id,wire.event_id,new Date(wire.ts),visitor,wire.page_id,wire.type,wire.path,JSON.stringify(clean),JSON.stringify(metadata)]);
        await ingestGovernance(client,site,clean as unknown as Record<string,unknown>,visitor);
        for(const [key,value] of Object.entries(clean.props??{}))await client.query('INSERT INTO event_data(site_id,event_id,ts,data_key,data_type,string_value,number_value,boolean_value) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[site.id,wire.event_id,new Date(wire.ts),key,typeof value==='string'?'s':typeof value==='number'?'n':'b',typeof value==='string'?value:null,typeof value==='number'?value:null,typeof value==='boolean'?value:null]);
        if(userId&&site.privacy_mode==='standard')await client.query('INSERT INTO identity_map(site_id,visitor_id,user_id) VALUES($1,$2,$3) ON CONFLICT(site_id,visitor_id) DO UPDATE SET user_id=$3',[site.id,visitor,userId]);
        await client.query('INSERT INTO outbox(site_id,event_id,ts,visitor_id) VALUES($1,$2,$3,$4)',[site.id,wire.event_id,new Date(wire.ts),visitor]);changed=true;accepted++;
      }
      if(changed){await dirtySite(client,site.id);await client.query('UPDATE sites SET last_event_at=now() WHERE id=$1',[site.id]);}
    });
    return reply.code(202).send({accepted,duplicates,rejected,clock_skew:Math.abs(Date.now()-envelope.sent_at)>86400000});
  });
}
