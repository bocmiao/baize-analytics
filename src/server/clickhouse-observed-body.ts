import {addStatsDecodedBytes,assertStatsReadBudget,statsReadSignal,statsResponseBytesAccounted} from './stats-read-budget.js';
import {measurePerformanceStage,type PerformanceAdapter} from './performance-observation.js';
/** Includes headers, complete bounded body transfer and buffer assembly. */
export async function readObservedClickHouseBody(request:()=>Promise<Response>,limit:number,missingCode:string,limitCode:string,adapter?:PerformanceAdapter):Promise<string>{
 const counts={batches:1,bytes:0,adapter};
 return measurePerformanceStage('ch_transport',async()=>{
  assertStatsReadBudget();const response=await request(),reader=response.body?.getReader();if(!reader)throw Error(missingCode);const chunks:Uint8Array[]=[];
  const signal=statsReadSignal(new AbortController().signal);const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
  try{while(true){const chunk=await reader.read();assertStatsReadBudget();if(chunk.done)break;if(!statsResponseBytesAccounted(response))addStatsDecodedBytes(chunk.value.byteLength);counts.bytes+=chunk.value.byteLength;if(counts.bytes>limit)throw Error(limitCode);chunks.push(chunk.value);}}finally{signal.removeEventListener('abort',cancel);await reader.cancel();}
  return Buffer.concat(chunks).toString('utf8');
 },counts);
}
