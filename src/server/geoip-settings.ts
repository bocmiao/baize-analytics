import { requireAdminSession } from './auth.js';
import {ApplicationError} from '../shared/error-codes.js';
import { ExternalError } from './external-errors.js';
import '@fastify/cookie';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from './context.js';
import { safeFetch,type Transport } from './outbound.js';
import { downloadGeoIP,geoIPStatus,type GeoProvider } from './geoip.js';
import {installIP2Region,ip2regionSnapshot} from './ip2region-snapshot.js';
import { sealSecret,unsealSecret } from './keyring.js';
export async function configuredGeoCredentials(ctx:AppContext){
 const row=(await ctx.pool.query("SELECT encrypted,settings FROM instance_settings WHERE name='geoip'")).rows[0];if(!row)return null;
 const secret=JSON.parse(unsealSecret(row.encrypted,ctx.config)) as {accountId?:string;licenseKey?:string};
 const provider:GeoProvider=row.settings.provider==='ip2region'?'ip2region':row.settings.provider==='maxmind'||secret.accountId?'maxmind':'ip2region';
 return {enabled:row.settings.enabled===true,provider,...secret};
}
const sameConfiguration=(left:Awaited<ReturnType<typeof configuredGeoCredentials>>,right:Awaited<ReturnType<typeof configuredGeoCredentials>>)=>JSON.stringify(left)===JSON.stringify(right);
export async function registerGeoIPSettings(app:FastifyInstance,ctx:AppContext,transport:Transport=safeFetch){
 app.get('/api/admin/geoip',async req=>{
  await requireAdminSession(ctx,req);const credentials=await configuredGeoCredentials(ctx),database=await geoIPStatus(ctx.config.dataDir,credentials?.provider);
  const hasCredentials=Boolean(credentials?.accountId&&credentials?.licenseKey);
  return {hasCredentials,enabled:credentials?.enabled??database.configured,provider:credentials?.provider??database.provider,credentialFingerprint:hasCredentials?createHash('sha256').update(credentials!.accountId+'\0'+credentials!.licenseKey).digest('hex').slice(0,12):null,database,availableSnapshot:{revision:ip2regionSnapshot.revision,license:ip2regionSnapshot.license,source:ip2regionSnapshot.source},verification:'official HTTPS + pinned revision + SHA256'};
 });
 app.put('/api/admin/geoip',async req=>{
  const user=await requireAdminSession(ctx,req);const b=z.object({provider:z.enum(['ip2region','maxmind']).optional(),accountId:z.string().regex(/^\d+$/).max(100).optional(),licenseKey:z.string().min(1).max(2000).optional(),enabled:z.boolean()}).strict().parse(req.body);
  let provider:GeoProvider='ip2region';const client=await ctx.pool.connect();
  try{
   await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(92834110)');
   const current=(await client.query("SELECT * FROM instance_settings WHERE name='geoip' FOR UPDATE")).rows[0],previous=current?JSON.parse(unsealSecret(current.encrypted,ctx.config)):{};
   const credentials={accountId:b.accountId??previous.accountId,licenseKey:b.licenseKey??previous.licenseKey};
   provider=b.provider??(b.accountId||b.licenseKey?'maxmind':current?.settings.provider??(previous.accountId?'maxmind':'ip2region'));
   if(provider==='maxmind'&&b.enabled&&(!credentials.accountId||!credentials.licenseKey))throw new ApplicationError('geoip_credentials_required');
   await client.query("INSERT INTO instance_settings(name,encrypted,settings) VALUES('geoip',$1,$2) ON CONFLICT(name) DO UPDATE SET encrypted=excluded.encrypted,settings=excluded.settings,updated_at=now()",[sealSecret(JSON.stringify(credentials),ctx.config),{enabled:b.enabled,provider}]);await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  await ctx.geoReload?.(b.enabled);await ctx.audit(user.id,null,'geoip.configure',{enabled:b.enabled,provider});return {saved:true,enabled:b.enabled,provider};
 });
 app.post('/api/admin/geoip/refresh',async req=>{
  const user=await requireAdminSession(ctx,req),credentials=await configuredGeoCredentials(ctx);if(credentials?.enabled===false)throw new ExternalError('geoip_not_configured');
  const provider=credentials?.provider??'ip2region';
  try{
   if(provider==='ip2region')await installIP2Region(ctx.config.dataDir,{transport});
   else {if(!credentials?.accountId||!credentials.licenseKey)throw new ExternalError('geoip_not_configured');await downloadGeoIP(ctx.config.dataDir,credentials.accountId,credentials.licenseKey,transport);}
   const after=await configuredGeoCredentials(ctx);if(!sameConfiguration(credentials,after))throw new ExternalError('external_config_changed');
   await ctx.geoReload?.(true);await ctx.audit(user.id,null,'geoip.refresh',{verified:true,provider});return {downloaded:true,database:await geoIPStatus(ctx.config.dataDir,provider)};
  }catch(error){if(error instanceof ExternalError&&['external_config_changed','geoip_not_configured'].includes(error.code))throw error;throw new ExternalError('geoip_refresh_failed');}
 });
}
