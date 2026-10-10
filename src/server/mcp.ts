import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import type {AppContext} from './context.js';
import {readQuestionAggregate,questionTools} from './ai-evidence.js';
import {aiReadQuerySchema} from '../../packages/contracts/ai-evidence.js';
import {ExternalError} from './external-errors.js';
import {resolveApiError} from '../shared/error-codes.js';
const versions=['2025-11-25','2025-06-18','2025-03-26'] as const;
const rpc=z.object({jsonrpc:z.literal('2.0'),id:z.union([z.string(),z.number().finite()]).optional(),method:z.string().min(1),params:z.record(z.string(),z.unknown()).optional()}).strict();
const tool={name:'query_analytics',description:questionTools[0].function.description,inputSchema:questionTools[0].function.parameters,annotations:{title:'Authorized site aggregate analytics',readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}};
/** Stateless MCP Streamable HTTP: no sessions, streaming GET, mutation tools or model calls. */
export async function registerMcp(app:FastifyInstance,ctx:AppContext){
 const path='/api/sites/:siteId/mcp';
 const authorize=async(req:FastifyRequest)=>{const origin=req.headers.origin;if(origin&&origin!==new URL(ctx.config.publicUrl).origin)throw Object.assign(Error('Invalid request origin'),{statusCode:403});await ctx.authorize(req,(req.params as {siteId:string}).siteId,'read');};
 for(const method of ['GET','DELETE'] as const)app.route({method,url:path,handler:async(req,reply)=>{await authorize(req);return reply.header('Allow','POST').code(405).send({error:'mcp_method_not_allowed'});}});
 app.post(path,{errorHandler(error,_req,reply){
  if(error.code==='FST_ERR_CTP_INVALID_JSON_BODY')return reply.code(400).send({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});
  if(error instanceof ExternalError)return reply.code(error.statusCode).send({error:error.code,message:error.message});
  const {statusCode,...body}=resolveApiError(error);return reply.code(statusCode).send(body);
 }},async(req,reply)=>{
  reply.header('Cache-Control','no-store');
  await authorize(req);const parsed=rpc.safeParse(req.body);
  const fail=(id:string|number|null,code:number,message:string)=>({jsonrpc:'2.0',id,error:{code,message}});
  if(!parsed.success)return reply.code(400).send(fail(null,-32600,'Invalid JSON-RPC request'));
  const message=parsed.data;
  const protocol=req.headers['mcp-protocol-version'];if(protocol&&(!Array.isArray(protocol)&&!versions.includes(protocol as typeof versions[number])||Array.isArray(protocol)))return reply.code(400).send(fail(message.id??null,-32600,'Unsupported MCP protocol version'));
  if(message.id===undefined)return reply.code(202).send();
  const id=message.id,params=message.params??{};
  if(message.method==='initialize'){
   const init=z.object({protocolVersion:z.string(),capabilities:z.record(z.string(),z.unknown()),clientInfo:z.object({name:z.string().min(1),version:z.string()}).passthrough()}).passthrough().safeParse(params);
   if(!init.success)return fail(id,-32602,'Invalid initialize parameters');
   return {jsonrpc:'2.0',id,result:{protocolVersion:versions.includes(init.data.protocolVersion as typeof versions[number])?init.data.protocolVersion:versions[0],capabilities:{tools:{listChanged:false}},serverInfo:{name:'baize-analytics',version:'0.1.0'},instructions:'Read-only site-scoped aggregates. No raw events, SQL, identity lookup, model calls or mutation. Calendar dates are inclusive; maximum31 days and100 groups.'}};
  }
  if(message.method==='ping')return {jsonrpc:'2.0',id,result:{}};
  if(message.method==='tools/list')return {jsonrpc:'2.0',id,result:{tools:[tool]}};
  if(message.method!=='tools/call')return fail(id,-32601,'Method not found');
  const call=z.object({name:z.literal('query_analytics'),arguments:aiReadQuerySchema}).strict().safeParse(params);
  if(!call.success)return fail(id,-32602,'Unknown tool or invalid arguments');
  await authorize(req);
  let result;
  try{const q=call.data.arguments;result=await readQuestionAggregate(ctx.pool,{siteId:(req.params as {siteId:string}).siteId,start:q.start,end:q.end},q);}
  catch(error){await authorize(req);if(!(error instanceof ExternalError))throw error;return {jsonrpc:'2.0',id,result:{isError:true,content:[{type:'text',text:JSON.stringify({error:error.code,message:error.message})}]}};}
  // readQuestionAggregate releases its client before rechecking membership/token; never borrow under a held lock.
  await authorize(req);
  return {jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result}};
 });
}
