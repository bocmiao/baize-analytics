import {statsReadSignal,budgetStatsSelectResponse} from './stats-read-budget.js';
import {configureClickHouseSelect,parseClickHouseSelectJson} from './clickhouse-select-budget.js';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import type {ClickHouseStoreConfig} from './clickhouse-store.js';
import {canonical} from './security.js';
/** Bounded transport only. Concrete kind schemas and ownership validation belong
 * to the remaining-fact adapter; this helper cannot publish receipts. */
export class RemainingFactTransport {
 constructor(private readonly config:ClickHouseStoreConfig){}
 scopeIdentity(){const u=new URL(this.config.url);return digest(canonical([u.origin,u.pathname,u.searchParams.get('database')??'default']))}
 async request(query:string,params:Record<string,string>={},body?:string,operation?:'select'){const u=new URL(this.config.url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('REMAINING_FACT_ENDPOINT_INVALID');u.searchParams.set('query',query);if(operation==='select')configureClickHouseSelect(u,this.config.timeoutMs??30000);for(const [k,v]of Object.entries(params))u.searchParams.set('param_'+k,v);let response:Response;try{response=await(this.config.fetch??fetch)(u,{method:'POST',headers:{'X-ClickHouse-User':this.config.username,'X-ClickHouse-Key':this.config.password},body,signal:statsReadSignal(AbortSignal.timeout(this.config.timeoutMs??30000))})}catch{throw Error('REMAINING_FACT_CH_UNAVAILABLE')};if(!response.ok){await response.body?.cancel();throw Error('REMAINING_FACT_CH_UNAVAILABLE')}return operation==='select'?budgetStatsSelectResponse(response):response}
 selectRequest(query:string,params:Record<string,string>={}){return this.request(query,params,undefined,'select');}
 async command(query:string,params:Record<string,string>={},body?:string){const response=await this.request(query,params,body);await response.body?.cancel()}
 async rows<T extends Record<string,unknown>>(query:string,params:Record<string,string>={}):Promise<T[]>{const response=await this.selectRequest(query+' FORMAT JSON',params),reader=response.body?.getReader();if(!reader)throw Error('REMAINING_FACT_CH_UNAVAILABLE');const chunks:Uint8Array[]=[];let size=0;try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16*1024*1024)throw Error('REMAINING_FACT_READ_LIMIT');chunks.push(part.value)}}finally{await reader.cancel()}const parsed:unknown=parseClickHouseSelectJson(Buffer.concat(chunks).toString('utf8'));if(!parsed||typeof parsed!=='object'||!Object.hasOwn(parsed,'data')||!Array.isArray((parsed as {data:unknown}).data))throw Error('REMAINING_FACT_BODY_UNAVAILABLE');return (parsed as {data:T[]}).data}
}
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export const remainingFactSeal=(secret:string,site:string,kind:string,record:unknown,source:unknown)=>createHmac('sha256',secret).update(canonical(['remaining-fact-store-v1',site,kind,record,source])).digest('hex');
export function sameSeal(a:string,b:string){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
export function receiptChecksum(rows:{row_key:string;body_hash:string}[]){return digest(rows.map(r=>r.row_key+':'+r.body_hash).join('\n'))}
