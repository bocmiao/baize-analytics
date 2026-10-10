import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';

/** Uses a live restored app and its real source-produced identity ledger.
 * Does not create bindings, bodies, authority flags or restore receipts. */
export async function assertStrictRestoredIdentityApi(input:{
 pool:Pool;baseUrl:string;cookie:string;siteId:string;from:string;to:string;
 expectedIdentities:{userKey:string;pages:number;sessions:number;paths:string[]}[];
 forbiddenPaths:string[];
}){
 const {pool,siteId}=input;
 const state=(await pool.query('SELECT authority,body_mode FROM canonical_event_authority WHERE site_id=$1',[siteId])).rows[0];
 assert.deepEqual(state,{authority:'clickhouse',body_mode:'strict'},'restored strict authority must be established by the restore fixture');
 for(const table of ['events','event_data','sessions','analytics_definitions']){
  assert.equal(Number((await pool.query(`SELECT count(*) n FROM ${table} WHERE site_id=$1`,[siteId])).rows[0].n),0,`${table} must have no fallback body`);
 }
 const query=new URLSearchParams({from:input.from,to:input.to});
 const get=async(path:string)=>{
  const response=await fetch(new URL(path,input.baseUrl),{headers:{cookie:input.cookie}});
  const text=await response.text();assert.equal(response.status,200,text);
  return JSON.parse(text) as Record<string,unknown>;
 };
 const list=await get(`/api/v1/sites/${siteId}/identities?${query}`);
 assert.equal(list.status,'supported');assert.equal(list.coverage,1);assert.equal((list.storage as {source:string}).source,'clickhouse');
 const identities=list.identities as {userKey:string;pages:number;sessions:number}[];
 assert.deepEqual(identities.map(x=>x.userKey).sort(),input.expectedIdentities.map(x=>x.userKey).sort());
 for(const expected of input.expectedIdentities){
  const actual=identities.find(x=>x.userKey===expected.userKey);assert.ok(actual);assert.equal(actual.pages,expected.pages);assert.equal(actual.sessions,expected.sessions);
  const activity=await get(`/api/v1/sites/${siteId}/identities/${expected.userKey}/activity?${query}`);
  assert.equal(activity.status,'supported');assert.equal(activity.coverage,1);assert.equal((activity.storage as {source:string}).source,'clickhouse');
  const sessions=activity.sessions as {pageviews:number}[];
  assert.equal(sessions.length,expected.sessions);
  assert.equal(sessions.reduce((n,x)=>n+x.pageviews,0),expected.pages);
  const pagePaths=(activity.events as {type:string;path:string}[]).filter(x=>x.type==='pageview').map(x=>x.path).sort();
  assert.deepEqual(pagePaths,[...expected.paths].sort());
  for(const path of input.forbiddenPaths)assert.ok(!pagePaths.includes(path));
 }
 assert.equal(pool.waitingCount,0);
 return {identities:identities.length,pages:identities.reduce((n,x)=>n+x.pages,0),source:'clickhouse',coverage:1,pgBodies:0};
}

/** Optional real source fixture hook: source-produced temporal bindings are
 * included in the fixture's ordinary PG backup; no SQL identity fabrication. */
export async function publishNativeIdentityHistory(input:{baseUrl:string;cookie:string;siteId:string;origin:string;at:number;from:string;to:string}){
 const visitorId=randomUUID(),pageId=randomUUID();
 const events=[
  {type:'identify',user_id:'restore-fixture-A',path:'/identity-A',ts:input.at},
  {type:'pageview',path:'/identity-A',ts:input.at+1000},
  {type:'identify',user_id:'restore-fixture-B',path:'/identity-B',ts:input.at+2000},
  {type:'pageview',path:'/identity-B',ts:input.at+3000},
 ].map(e=>({...e,event_id:randomUUID(),visitor_id:visitorId,page_id:pageId,url:input.origin+e.path}));
 const response=await fetch(new URL('/api/collect',input.baseUrl),{method:'POST',headers:{origin:input.origin,'user-agent':'Mozilla/5.0 Chrome/128.0 Safari/537.36','content-type':'application/json'},body:JSON.stringify({protocol_version:1,site_id:input.siteId,sdk:'actual-native-restore-identities',sent_at:Date.now(),events})});
 const text=await response.text();assert.equal(response.status,202,text);const collected=JSON.parse(text);assert.equal(collected.accepted,4);assert.equal(collected.duplicates,0);assert.deepEqual(collected.rejected,[]);
 const q=new URLSearchParams({from:input.from,to:input.to});
 const listResponse=await fetch(new URL(`/api/v1/sites/${input.siteId}/identities?${q}`,input.baseUrl),{headers:{cookie:input.cookie}});
 const listText=await listResponse.text();assert.equal(listResponse.status,200,listText);const list=JSON.parse(listText);assert.equal(list.status,'supported');assert.equal(list.coverage,1);
 const identified=new Map<string,{userKey:string;pages:number;sessions:number;paths:string[]}>();
 for(const identity of list.identities){
  const activityResponse=await fetch(new URL(`/api/v1/sites/${input.siteId}/identities/${identity.userKey}/activity?${q}`,input.baseUrl),{headers:{cookie:input.cookie}});
  const activityText=await activityResponse.text();assert.equal(activityResponse.status,200,activityText);const activity=JSON.parse(activityText);const paths=(activity.events as {type:string;path:string}[]).filter(e=>e.type==='pageview').map(e=>e.path);
  for(const path of ['/identity-A','/identity-B'])if(paths.includes(path)){assert.equal(identity.pages,1);assert.equal(identity.sessions,1);identified.set(path,{userKey:identity.userKey,pages:1,sessions:1,paths:[path]});}
 }
 assert.equal(identified.size,2);assert.notEqual(identified.get('/identity-A')!.userKey,identified.get('/identity-B')!.userKey);
 return {visitorId,events,A:identified.get('/identity-A')!,B:identified.get('/identity-B')!};
}
