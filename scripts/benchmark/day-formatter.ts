import {writeFile} from 'node:fs/promises';
import {dayOf} from '../../src/server/analytics-core.js';
const zones=['UTC','Asia/Shanghai','America/New_York','Asia/Kathmandu'];
const timestamps=['2026-03-08T06:59:59Z','2026-03-08T07:00:00Z','2026-11-01T05:59:59Z','2026-11-01T06:00:00Z','2026-10-01T15:59:59Z','2026-10-01T16:00:00Z','2026-12-31T23:59:59Z','2027-01-01T00:00:00Z'];
const oracle=(ts:Date|string,zone:string)=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ts));return ['year','month','day'].map(k=>parts.find(p=>p.type===k)!.value).join('-');};
let checksum=0;const run=(implementation:typeof dayOf)=>{for(let i=0;i<25;i++)for(const zone of zones)for(const ts of timestamps)checksum+=implementation(ts,zone).length;};
for(let i=0;i<2;i++)run(dayOf);
const observations=[];for(let pair=0;pair<6;pair++)for(const selected of pair%2?['current','oracle']:['oracle','current']){const start=performance.now(),cpu=process.cpuUsage();run(selected==='current'?dayOf:oracle);const usage=process.cpuUsage(cpu);observations.push({pair,selected,calls:800,wallMs:performance.now()-start,cpuUserUs:usage.user,cpuSystemUs:usage.system});}
await writeFile(process.env.DAY_FORMATTER_EVIDENCE??'/tmp/day-formatter.json',JSON.stringify({scope:'short interleaved pure-computation measurement; repeated fixed four zones/eight dates; excludes PG/worker scheduling, not ACK evidence',checksum,observations},null,2));
