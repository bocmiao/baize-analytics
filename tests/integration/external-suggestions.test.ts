import {Pool} from 'pg';
import {isolatedTestConnectionString} from '../support/database-url.js';
import {migrate} from '../../src/server/db.js';
import Fastify,{type InjectOptions} from 'fastify';
import cookie from '@fastify/cookie';
import {authFunctions} from '../../src/server/auth.js';
import {hashToken} from '../../src/server/security.js';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {describe,it,expect} from 'vitest';
import {registerCollect} from '../../src/server/collect.js';
import {registerAnalytics} from '../../src/server/analytics.js';
import {registerExternal} from '../../src/server/external.js';
import {rebuildSite} from '../../src/server/worker.js';
import type {AppContext} from '../../src/server/context.js';
import type {Transport} from '../../src/server/outbound.js';
describe.skipIf(!process.env.TEST_DATABASE_URL)('F59 real collection and PostgreSQL funnel evidence with fixture LLM only',()=>{
 it('captures funnel losses and lowercase vitals, sorts explicitly labeled benefit proxies',async()=>{
  const schema='suggestions_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:isolatedTestConnectionString(),options:`-c search_path=${schema},public`,max:1}),app=Fastify(),site='suggestions-'+randomUUID(),uid=randomUUID(),dataDir=await mkdtemp('/tmp/baize-suggestion-');let sent:Record<string,unknown>|undefined;const token=randomBytes(32).toString('hex'),inject=(options:InjectOptions)=>app.inject({cookies:{baize_session:token},...options});
  const ctx:AppContext={pool,redis:null,config:{dataDir,masterKey:randomBytes(32),publicUrl:'https://baize.example'},user:authFunctions(pool).user,authorize:async(req,id,permission)=>{if(id!==site)throw new Error('Wrong site');return authFunctions(pool).authorize(req,id,permission);},audit:async()=>{}};
  const transport:Transport=async(url,options)=>{expect(url).toBe('https://provider.example/v1/chat/completions');sent=JSON.parse(JSON.parse(options!.body!).messages[1].content).aggregate;return {status:200,headers:{},text:JSON.stringify({usage:{total_tokens:10},choices:[{message:{content:'仅给出观察性候选，收益未经验证。'}}]})};};
  try{
   await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);
   await pool.query("INSERT INTO users(id,email,password_hash,name,is_admin) VALUES($1,$2,'unused','Fixture',true)",[uid,`${uid}@example.test`]);await pool.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[hashToken(token),uid]);await app.register(cookie);await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'Suggestion test','example.test','salt')",[site]);await registerCollect(app,ctx);await registerAnalytics(app,ctx);await registerExternal(app,ctx,transport);
   const funnel=await inject({method:'POST',url:`/api/v1/sites/${site}/funnels`,payload:{name:'真实采集购买流程',steps:[{type:'page',value:'/start'},{type:'page',value:'/finish'}],strict:false}});expect(funnel.statusCode,funnel.body).toBe(200);
   const day=new Date(Date.now()-2*86400000).toISOString().slice(0,10),ts=new Date(day+'T12:00:00Z').getTime(),events=[];
   for(let i=0;i<25;i++){const visitor_id=randomUUID(),page_id=randomUUID();events.push({event_id:randomUUID(),visitor_id,page_id,type:'pageview',ts:ts+i*10000,path:'/start',url:'https://example.test/start'});events.push({event_id:randomUUID(),visitor_id,page_id,type:'vitals',ts:ts+i*10000+1000,path:'/start',url:'https://example.test/start',vitals:{lcp:4500}});if(i<5)events.push({event_id:randomUUID(),visitor_id,page_id:randomUUID(),type:'pageview',ts:ts+i*10000+2000,path:'/finish',url:'https://example.test/finish'});}
   for(let i=0;i<events.length;i+=50){const response=await inject({method:'POST',url:'/api/collect',headers:{origin:'https://example.test','user-agent':'Mozilla/5.0'},payload:{protocol_version:1,site_id:site,sdk:'real-funnel-test',sent_at:Date.now(),events:events.slice(i,i+50)}});expect(response.statusCode,response.body).toBe(202);expect(response.json().accepted,response.body).toBe(events.slice(i,i+50).length);}
   const owner=randomUUID(),state=(await pool.query("UPDATE aggregation_state SET lease_owner=$2,lease_until=now()+interval '1 minute' WHERE site_id=$1 RETURNING epoch,generation::text",[site,owner])).rows[0];expect(await rebuildSite(pool,{site_id:site,generation:state.generation,epoch:state.epoch,lease_owner:owner})).toBe(true);
   const configured=await inject({method:'PUT',url:`/api/sites/${site}/external`,payload:{kind:'ai',secret:'fixture-key',settings:{endpoint:'https://provider.example/v1',model:'fixture',enabled:true,monthlyTokenBudget:1000000}}});expect(configured.statusCode,configured.body).toBe(200);const response=await inject({method:'POST',url:`/api/sites/${site}/ai`,payload:{purpose:'suggestions',start:day,end:day}});expect(response.statusCode,response.body).toBe(200);
   const evidence=response.json().evidence;expect(evidence.funnels[0].id).toBe(funnel.json().id);expect(evidence.funnels[0].steps).toEqual([25,5]);expect(sent).toEqual(evidence);for(const event of events)expect(JSON.stringify(sent)).not.toContain(event.visitor_id);
   const rows=(await inject({method:'GET',url:`/api/sites/${site}/suggestions`})).json().rows as {title:string;category:string;priority_score:number;priority_basis:{caveat:string};evidence_id:string}[];expect(rows.some(row=>row.title.includes('流失 20'))).toBe(true);expect(rows[0].category).toBe('performance');expect(rows.map(row=>row.priority_score)).toEqual(rows.map(row=>row.priority_score).sort((a,b)=>b-a));for(const row of rows){expect(row.priority_basis.caveat).toContain('不是预测、实测收益');expect(row.evidence_id).toBe(response.json().id);}
   await pool.query("UPDATE sites SET privacy_mode='daily_salt' WHERE id=$1",[site]);const privateResult=await inject({method:'POST',url:`/api/sites/${site}/ai`,payload:{purpose:'suggestions',start:day,end:new Date(new Date(day).getTime()+86400000).toISOString().slice(0,10)}});expect(privateResult.statusCode,privateResult.body).toBe(200);expect(privateResult.json().evidence.funnels[0].status).toBe('unsupported_in_this_mode');expect(privateResult.json().evidence.funnels[0].steps).toEqual([]);
  }finally{await app.close();await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();await rm(dataDir,{recursive:true,force:true});}
 });
});
