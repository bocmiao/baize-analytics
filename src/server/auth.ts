import type { FastifyInstance,FastifyRequest } from 'fastify';
import type { AppContext, User, Permission } from './context.js';
import type { Pool } from 'pg';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { hashToken,hashPassword,checkPassword,HttpError } from './security.js';
import { transaction } from './db.js';
import { ApplicationError } from '../shared/error-codes.js';
import {ensurePrivateInstallNonce,verifyPrivateInstallNonce,validatePrivateInstallNonceBinding,removePrivateInstallNonce,hasRestoreBootstrapBlock} from '../shared/install-guard.js';
import {resolve} from 'node:path';
import { accountPasswordSchema } from '../shared/account-password.js';
export async function requireAdminSession(ctx:Pick<AppContext,'user'>,req:FastifyRequest):Promise<User>{
  if(!req.cookies.baize_session||req.headers.authorization!==undefined)throw new ApplicationError('admin_cookie_required');
  const user=await ctx.user(req);
  if(!user.is_admin)throw new ApplicationError('instance_admin_required');
  return user;
}
export function authFunctions(pool:Pick<Pool,'query'>){
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
const standardKeyDir=(ctx:AppContext)=>resolve(ctx.config.keyDir??ctx.config.dataDir+'-keys');
export async function prepareStandardBootstrap(ctx:AppContext):Promise<void>{await transaction(ctx.pool,async client=>{await client.query('SELECT pg_advisory_xact_lock(92834102)');const state=(await client.query('SELECT state,nonce_hash FROM install_bootstrap WHERE id=1 FOR UPDATE')).rows[0];const exists=(await client.query('SELECT id FROM users LIMIT 1')).rowCount;if(exists){if(!state||state.state==='pending')await client.query("INSERT INTO install_bootstrap(id,state) VALUES(1,'legacy') ON CONFLICT(id) DO UPDATE SET state='legacy',nonce_hash=NULL");return;}if(state&&state.state!=='pending')return;const keyDir=standardKeyDir(ctx);if(hasRestoreBootstrapBlock(keyDir)){await client.query("INSERT INTO install_bootstrap(id,state) VALUES(1,'restored_blocked') ON CONFLICT(id) DO UPDATE SET state='restored_blocked',nonce_hash=NULL");return;}if(state)validatePrivateInstallNonceBinding(keyDir,state.nonce_hash);else{const guard=ensurePrivateInstallNonce(keyDir);await client.query("INSERT INTO install_bootstrap(id,state,nonce_hash) VALUES(1,'pending',$1)",[guard.hash]);}});}
async function standardBootstrapStatus(ctx:AppContext){const state=(await ctx.pool.query('SELECT state FROM install_bootstrap WHERE id=1')).rows[0]?.state;const exists=(await ctx.pool.query('SELECT id FROM users LIMIT 1')).rowCount;const terminal=state&&state!=='pending';return {required:!exists&&!terminal,credentialRequired:!exists&&!terminal,state:state??(exists?'legacy':'pending'),...(!exists&&terminal?{blocked:true}:{})};}
export async function registerAuth(app:FastifyInstance,ctx:AppContext){
  await prepareStandardBootstrap(ctx);
  const loginSchema=z.object({email:z.email().max(256).transform(v=>v.toLowerCase()),password:accountPasswordSchema,name:z.string().min(1).max(128).optional()});
  const limits=new Map<string,{count:number,time:number}>();
  const attempt=(req:FastifyRequest)=>{const k=hashToken(req.ip);const now=Date.now();const entry=limits.get(k);if(entry&&now-entry.time<60000){if(++entry.count>10)throw new HttpError(429,'登录尝试过多');}else limits.set(k,{count:1,time:now});if(limits.size>10000)limits.clear();};
  app.get('/api/setup',async()=>standardBootstrapStatus(ctx));
  app.post('/api/setup',async(req,reply)=>{
    if(req.headers.authorization!==undefined)throw new HttpError(403,'admin_cookie_required');
    attempt(req);const body=loginSchema.extend({installationNonce:z.string().max(64).optional()}).strict().parse(req.body);const token=randomBytes(32).toString('hex');
    const user=await transaction(ctx.pool,async client=>{
      await client.query('SELECT pg_advisory_xact_lock(92834102)');const state=(await client.query('SELECT state,nonce_hash FROM install_bootstrap WHERE id=1 FOR UPDATE')).rows[0];
      if((await client.query('SELECT id FROM users LIMIT 1')).rowCount||state&&state.state!=='pending')throw new HttpError(409,'初始化已完成');
      if(!state)throw new HttpError(503,'INSTALL_NOT_PREPARED');verifyPrivateInstallNonce(standardKeyDir(ctx),body.installationNonce??'',state.nonce_hash);
      const row=await client.query('INSERT INTO users(email,password_hash,name,is_admin) VALUES($1,$2,$3,true) RETURNING id,email,name,is_admin',[body.email,await hashPassword(body.password),body.name??'管理员']);const created=row.rows[0];
      await client.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",[hashToken(token),created.id]);
      await client.query('INSERT INTO audit_logs(actor_id,site_id,action,target) VALUES($1,NULL,$2,$3)',[created.id,'setup',JSON.stringify({email:created.email})]);
      await client.query("UPDATE install_bootstrap SET state='claimed',nonce_hash=NULL,claimed_user_id=$1,claimed_at=now() WHERE id=1",[created.id]);return created;
    });
    try{removePrivateInstallNonce(standardKeyDir(ctx));}catch{/* Durable terminal claim wins; cleanup failure cannot undo or misreport the commit. */}
    reply.setCookie('baize_session',token,{path:'/',httpOnly:true,sameSite:'lax',secure:ctx.config.publicUrl.startsWith('https:'),maxAge:604800});return {user};
  });
  app.post('/api/login',async(req,reply)=>{attempt(req);const body=loginSchema.parse(req.body);const found=await ctx.pool.query('SELECT * FROM users WHERE email=$1',[body.email]);const row=found.rows[0];const ok=await checkPassword(body.password,row?.password_hash??'scrypt:invalid:'+ '00'.repeat(64));if(!row||!ok)throw new HttpError(401,'邮箱或密码错误');const token=randomBytes(32).toString('hex');await ctx.pool.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",[hashToken(token),row.id]);reply.setCookie('baize_session',token,{path:'/',httpOnly:true,sameSite:'lax',secure:ctx.config.publicUrl.startsWith('https:'),maxAge:604800});return {user:{id:row.id,email:row.email,name:row.name,is_admin:row.is_admin}};});
  app.post('/api/logout',async(req,reply)=>{if(req.cookies.baize_session)await ctx.pool.query('DELETE FROM auth_sessions WHERE token_hash=$1',[hashToken(req.cookies.baize_session)]);reply.clearCookie('baize_session',{path:'/'});return {ok:true};});
  app.get('/api/me',async req=>({user:await ctx.user(req)}));
}
