import {writeFile} from 'node:fs/promises';
import {eventDimensions,prepareEventDimensions} from '../../src/server/dimensions.js';
import type {WireEvent} from '../../packages/contracts/index.js';
const ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
const events=Array.from({length:50},(_,i)=>({type:'pageview',url:'https://example.test',path:'/',ts:1700000000000+i*1000,event_id:'e',page_id:'p',screen:i%2?'390x844':'1280x720',referrer:'https://google.com/search?q=hello',utm_source:i%2?'a':'b'} as WireEvent));
let checksum=0;
const run=(candidate:boolean)=>{const dimensions=candidate?prepareEventDimensions(ua):undefined,formatter=candidate?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}):undefined;for(const event of events){checksum+=(dimensions?dimensions(event):eventDimensions(ua,event)).device.length;checksum+=(formatter??new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'})).format(new Date(event.ts)).length;}};
for(let i=0;i<8;i++){run(false);run(true);}
const observations=[];
for(let pair=0;pair<12;pair++)for(const candidate of pair%2?[true,false]:[false,true]){const cpu=process.cpuUsage(),start=performance.now();for(let batch=0;batch<20;batch++)run(candidate);const usage=process.cpuUsage(cpu);observations.push({pair,candidate,batches:20,events:1000,wallMs:performance.now()-start,cpuUserUs:usage.user,cpuSystemUs:usage.system});}
await writeFile(process.env.BATCH_COMPUTATION_EVIDENCE??'/tmp/batch-computation.json',JSON.stringify({scope:'interleaved pure-computation diagnostic; same UA, 50-event batches; excludes SQL/provenance and is not ACK or throughput evidence',checksum,observations},null,2));
