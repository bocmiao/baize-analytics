import type { FastifyInstance,FastifyRequest } from 'fastify';
import type { AppContext, User, Permission } from './context.js';
import type { Pool } from 'pg';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { hashToken,hashPassword,checkPassword,HttpError } from './security.js';
import { transaction } from './db.js';
export function authFunctions(pool:Pool){
  async function user(req:FastifyRequest):Promise<User>{
    const bearer=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):null;
    if(bearer){const found=await pool.query('SELECT u.id,u.email,u.name,u.is_admin FROM api_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=$1 AND NOT t.revoked AND (t.expires_at IS NULL OR t.expires_at>now())',[hashToken(bearer)]);if(found.rowCount)return found.rows[0];throw new HttpError(401,'无效或已过期的 API Token');}
    const token=req.cookies.baize_session;if(!token)throw new HttpError(401,'请先登录');
    const found=await pool.query('SELECT u.id,u.email,u.name,u.is_admin FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',[hashToken(token)]);
    if(!found.rowCount)throw new HttpError(401,'会话已失效');return found.rows[0];
  }
  async function authorize(req:FastifyRequest,siteId:string,permission:Permission='read'){
    const u=await user(req);
    if(req.headers.authorization?.startsWith('Bearer ')){
      const token=req.headers.authorization.slice(7);const found=await pool.query('SELECT scopes FROM api_tokens WHERE token_hash=$1 AND site_id=$2 AND NOT revoked AND (expires_at IS NULL OR expires_at>now())',[hashToken(token),siteId]);
      const scopes:string[]=found.rows[0]?.scopes??[];if(!found.rowCount||(!scopes.includes(permission)&&!scopes.includes('admin')&&!(permission==='read'&&scopes.includes('write'))))throw new HttpError(403,'Token 无此站点权限');
    }
    const found=await pool.query('SELECT s.id,m.role FROM sites s LEFT JOIN site_members m ON m.site_id=s.id AND m.user_id=$2 WHERE s.id=$1',[siteId,u.id]);
    if(!found.rowCount)throw new HttpError(404,'站点不存在');const role=found.rows[0].role;
    if(!u.is_admin&&(!role||(permission==='write'&&role==='viewer')||(permission==='admin'&&!['owner','admin'].includes(role))))throw new HttpError(403,'无此站点权限');return u;
  }
  return {user,authorize};
}
export async function registerAuth(app:FastifyInstance,ctx:AppContext){
  const loginSchema=z.object({email:z.email().max(256).transform(v=>v.toLowerCase()),password:z.string().min(12).max(256),name:z.string().min(1).max(128).optional()});
  const limits=new Map<string,{count:number,time:number}>();
  const attempt=(req:FastifyRequest)=>{const k=hashToken(req.ip);const now=Date.now();const entry=limits.get(k);if(entry&&now-entry.time<60000){if(++entry.count>10)throw new HttpError(429,'登录尝试过多');}else limits.set(k,{count:1,time:now});if(limits.size>10000)limits.clear();};
  app.get('/api/setup',async()=>({required:Number((await ctx.pool.query('SELECT count(*) FROM users')).rows[0].count)===0}));
  app.post('/api/setup',async(req,reply)=>{attempt(req);const body=loginSchema.parse(req.body);const user=await transaction(ctx.pool,async client=>{await client.query('SELECT pg_advisory_xact_lock(92834102)');if(Number((await client.query('SELECT count(*) FROM users')).rows[0].count))throw new HttpError(409,'初始化已完成');const row=await client.query('INSERT INTO users(email,password_hash,name,is_admin) VALUES($1,$2,$3,true) RETURNING id,email,name,is_admin',[body.email,await hashPassword(body.password),body.name??'管理员']);return row.rows[0];});const token=randomBytes(32).toString('hex');await ctx.pool.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",[hashToken(token),user.id]);reply.setCookie('baize_session',token,{path:'/',httpOnly:true,sameSite:'lax',secure:ctx.config.publicUrl.startsWith('https:'),maxAge:604800});await ctx.audit(user.id,null,'setup',{email:user.email});return {user};});
  app.post('/api/login',async(req,reply)=>{attempt(req);const body=loginSchema.parse(req.body);const found=await ctx.pool.query('SELECT * FROM users WHERE email=$1',[body.email]);const row=found.rows[0];const ok=await checkPassword(body.password,row?.password_hash??'scrypt:invalid:'+ '00'.repeat(64));if(!row||!ok)throw new HttpError(401,'邮箱或密码错误');const token=randomBytes(32).toString('hex');await ctx.pool.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",[hashToken(token),row.id]);reply.setCookie('baize_session',token,{path:'/',httpOnly:true,sameSite:'lax',secure:ctx.config.publicUrl.startsWith('https:'),maxAge:604800});return {user:{id:row.id,email:row.email,name:row.name,is_admin:row.is_admin}};});
  app.post('/api/logout',async(req,reply)=>{if(req.cookies.baize_session)await ctx.pool.query('DELETE FROM auth_sessions WHERE token_hash=$1',[hashToken(req.cookies.baize_session)]);reply.clearCookie('baize_session',{path:'/'});return {ok:true};});
  app.get('/api/me',async req=>({user:await ctx.user(req)}));
}
