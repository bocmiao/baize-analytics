import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const base=process.env.BAIZE_PHP_HTTP_URL||'http://127.0.0.1:8099';if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Disposable loopback fixtures only');
const fixture=JSON.parse(readFileSync(process.env.BAIZE_PHP_HTTP_SESSION||'.baize/php-http/session.json','utf8'));
const output=process.env.BAIZE_PHP_HTTP_EVIDENCE||'docs/test-evidence/php-20261015/receipt-privacy';mkdirSync(output,{recursive:true});
const baseline=process.env.BAIZE_EXPECT_RECEIPT_LEAK==='1';
const json=async(path,body)=>{const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{cookie:fixture.cookie,Origin:base,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();return {status:response.status,data};};
const created=await json('/api/v1/sites',{name:'去重墓碑隐私HTTP验收',domain:'php-fixture.example.test',timezone:'UTC',config:{replay:true}});assert.equal(created.status,201);const site=created.data.site.id;
const visitor=randomUUID(),eventId=randomUUID(),pageId=randomUUID(),marker='/deleted-replay-private-'+randomUUID(),now=Date.now()-1000;
const envelope={protocol_version:1,site_id:site,sdk:'receipt-privacy-real-http/1',sent_at:Date.now(),events:[{event_id:eventId,visitor_id:visitor,page_id:pageId,type:'replay',ts:now,url:'https://php-fixture.example.test'+marker,path:marker,replay_seq:0,replay:[{type:3,timestamp:now,data:{source:0,texts:[],attributes:[],removes:[],adds:[]}}]}]};
const send=async()=>{const response=await fetch(base+'/api/collect',{method:'POST',headers:{Origin:'https://php-fixture.example.test','Content-Type':'application/json','User-Agent':'Mozilla/5.0 Chrome/151.0.0.0 Safari/537.36'},body:JSON.stringify(envelope)});return {status:response.status,data:await response.json()};};
const collected=await send();assert.equal(collected.status,202);assert.equal(collected.data.accepted,1);assert.equal((await send()).data.duplicates,1);
assert.equal((await json('/api/v1/sites/'+site+'/delete-visitor',{visitor_id:visitor})).status,200);
const jobs=[];for(const format of ['json','csv']){const job=await json('/api/v1/sites/'+site+'/exports',{format,full:true});assert.equal(job.status,200);jobs.push({id:job.data.id,format});}
const container=process.env.BAIZE_PHP_WORKER_CONTAINER||'baize-php-http-test',directory=process.env.BAIZE_PHP_WORKER_DIRECTORY||'/app',command=process.env.BAIZE_PHP_WORKER_SCRIPT||'php/bin/worker.php';
const dockerArgs=['exec',...(process.env.BAIZE_PHP_WORKER_USER?['--user',process.env.BAIZE_PHP_WORKER_USER]:[]),'-w',directory,container,'php',command,'--once'];execFileSync('docker',dockerArgs,{encoding:'utf8'});
const results=[];for(const job of jobs){const response=await fetch(base+'/api/v1/sites/'+site+'/exports/'+job.id,{headers:{cookie:fixture.cookie}});assert.equal(response.status,200);const text=await response.text();const leaked=text.includes(marker)||text.includes(visitor)||text.includes(pageId);assert.equal(leaked,baseline,'New '+job.format+' full export must not disclose a deleted replay through any namespace');const exported=job.format==='json'?JSON.parse(text):null;const internal=exported?Object.keys(exported.tables).filter(key=>['event_keys','replay_keys','order_keys','privacy_tombstones','privacy_applied'].includes(key)):[];if(!baseline)assert.deepEqual(internal,[]);results.push({format:job.format,status:response.status,deletedMarkerPresent:leaked,internalNamespaces:internal,checkedEveryNamespace:true});}
const after=await send();assert.equal(after.data.accepted,0);assert.ok(after.data.rejected.length>0);
const result={mode:baseline?'negative archived-preview reproduction':'fixed candidate regression',baseUrl:base,syntheticFixture:true,liveExternalCalls:false,realHttp:true,siteId:site,collected:1,duplicateBeforeDeletion:1,newFullExportsAfterDeletion:results,retryAfterDeletionAccepted:0};writeFileSync(output+'/results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
