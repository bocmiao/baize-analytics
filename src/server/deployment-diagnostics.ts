import type {FastifyInstance} from 'fastify';
import type {AppContext} from './context.js';
import {requireAdminSession} from './auth.js';
import {verifyPrivateInstallNonce,hasRestoreBootstrapBlock} from '../shared/install-guard.js';
import {registerDeploymentDiagnostics} from '../shared/deployment-diagnostics.js';
export function registerStandardDeploymentDiagnostics(app:FastifyInstance,ctx:AppContext){
 const keyDir=ctx.config.keyDir??ctx.config.dataDir+'-keys';
 registerDeploymentDiagnostics(app,{profile:'standard',dataDir:ctx.config.dataDir,keyDir,publicUrl:ctx.config.publicUrl,
  authorize:async(request,nonce)=>{if(request.headers.authorization!==undefined)throw Object.assign(Error('admin_cookie_required'),{statusCode:403});if(request.cookies.baize_session){await requireAdminSession(ctx,request);return;}const found=await ctx.pool.query("SELECT state,nonce_hash FROM install_bootstrap WHERE id=1");const state=found.rows[0];if(!state||state.state!=='pending'||hasRestoreBootstrapBlock(keyDir)||(await ctx.pool.query('SELECT id FROM users LIMIT 1')).rowCount)throw Object.assign(Error('INSTALL_DIAGNOSTIC_AUTH_REQUIRED'),{statusCode:403});verifyPrivateInstallNonce(keyDir,nonce??'',String(state.nonce_hash));},
  storage:async()=>{const versions=await ctx.pool.query('SELECT version FROM schema_migrations');return {backend:'postgresql',available:true,schemaVersion:Math.max(0,...versions.rows.map(row=>parseInt(String(row.version),10)||0))};}
 });
}
