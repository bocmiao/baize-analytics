import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
const mode=process.argv[2];const statePath=process.argv[3];if(!statePath)throw Error('State file required');
const base=process.env.PUBLIC_URL;if(!base||!new URL(base).hostname.match(/^(localhost|127\.0\.0\.1)$/))throw Error('Loopback test URL required');
interface State{cookie:string;siteId:string;visitor:string}
async function request(path:string,body:unknown,cookie=''){const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});assert.ok(response.ok,`${path}: HTTP${response.status}`);return response;}
if(mode==='seed') {
 const response=await request('/api/setup',{email:'ops@example.invalid',password:crypto.randomUUID()+'Baize1!',name:'运维真实验收'});
 const cookie=response.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
 const created=await(await request('/api/v1/sites',{name:'运维测试站点',domain:'example.invalid',privacy_mode:'standard'},cookie)).json() as {site:{id:string}};
 const visitor=crypto.randomUUID();
 const collected=await(await request('/api/collect',{protocol_version:1,site_id:created.site.id,sdk:'ops-lifecycle/0.1.0',sent_at:Date.now(),events:[{event_id:crypto.randomUUID(),visitor_id:visitor,page_id:crypto.randomUUID(),type:'pageview',ts:Date.now(),url:'https://example.invalid/backup-fixture',path:'/backup-fixture'}]})).json() as {accepted:number};
 assert.equal(collected.accepted,1);
 await writeFile(statePath,JSON.stringify({cookie,siteId:created.site.id,visitor}),{mode:0o600});
 console.log('Real HTTP administrator/site/collector fixture persisted.');
} else if(mode==='delete') {
 const state=JSON.parse(await readFile(statePath,'utf8')) as State;
 const result=await(await request(`/api/v1/sites/${state.siteId}/delete-visitor`,{visitor_id:state.visitor},state.cookie)).json() as {deleted:boolean;journal:string};
 assert.equal(result.deleted,true);assert.equal(result.journal,'durable');
 console.log('Post-backup deletion durably journaled.');
} else throw Error('Unknown mode');
