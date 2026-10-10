import type {PoolClient} from 'pg';
import {stableIdentityKey} from '../../packages/tracker/src/privacy.js';
export const EXPORT_ROW_LIMIT=100000;
// Static SQL only. Runtime input can never select another relation or column.
export const SITE_EXPORT_QUERIES={
 event_data:'SELECT d.site_id,d.event_id,d.ts,d.data_key,d.data_type,d.string_value,d.number_value,d.boolean_value,d.date_value FROM event_data d JOIN events e USING(site_id,event_id,ts) WHERE d.site_id=$1 AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=e.site_id AND t.visitor_id=e.visitor_id) AND NOT EXISTS(SELECT 1 FROM identity_tombstones t WHERE t.site_id=e.site_id AND t.visitor_id=e.visitor_id AND t.started_at<=e.ts AND t.ended_at>e.ts)',
 replay_chunks:'SELECT site_id,session_id,seq,payload,created_at FROM replay_chunks WHERE site_id=$1',
 heatmap_points:'SELECT site_id,path,kind,x,y,viewport,count FROM heatmap_points WHERE site_id=$1',
 sessions:'SELECT id,site_id,visitor_id,started_at,last_active,entry_path,exit_path,pageviews,duration_s,visible_ms,bounced,dimensions,generation FROM sessions WHERE site_id=$1',
 visitor_first_seen:'SELECT site_id,visitor_id,first_date FROM visitor_first_seen WHERE site_id=$1',
 identity_map:'SELECT site_id,visitor_id,user_id,created_at FROM identity_map WHERE site_id=$1',
 identity_bindings:'SELECT site_id,visitor_id,user_id,started_at,ended_at FROM identity_bindings WHERE site_id=$1',
 tombstones:'SELECT site_id,visitor_id,user_id,deleted_at,source FROM tombstones WHERE site_id=$1',
 identity_tombstones:'SELECT site_id,visitor_id,user_id,started_at,ended_at,deleted_at,source FROM identity_tombstones WHERE site_id=$1',
 event_keys:'SELECT site_id,event_id,hash,ts,visitor_id FROM event_keys WHERE site_id=$1',
 bot_counts:'SELECT site_id,day,category,count FROM bot_counts WHERE site_id=$1',
 revenue_orders:'SELECT site_id,order_hash,visitor_id,event_id,ts,currency,amount,privacy_mode,order_day FROM revenue_orders WHERE site_id=$1',
 stats_hourly:'SELECT site_id,hour,data,generation FROM stats_hourly WHERE site_id=$1',
 stats_daily:'SELECT site_id,day,data,generation FROM stats_daily WHERE site_id=$1',
 page_vitals:'SELECT site_id,day,path,metric,digest,sample_count FROM page_vitals WHERE site_id=$1',
 goals:'SELECT id,site_id,name,type,config,created_at FROM goals WHERE site_id=$1',
 funnels:'SELECT id,site_id,name,steps,strict,created_at FROM funnels WHERE site_id=$1',
 analytics_definitions:'SELECT site_id,data,generation FROM analytics_definitions WHERE site_id=$1',
 experiments:'SELECT id,site_id,name,variants,goal,enabled,conversion_history_status FROM experiments WHERE site_id=$1',
 experiment_assignments:'SELECT a.experiment_id,a.visitor_id,a.variant,a.converted FROM experiment_assignments a JOIN experiments e ON e.id=a.experiment_id WHERE e.site_id=$1',
 experiment_contributions:'SELECT c.experiment_id,c.site_id,c.visitor_id,c.event_id,c.ts FROM experiment_contributions c JOIN experiments e ON e.id=c.experiment_id WHERE c.site_id=$1 AND e.site_id=$1',
 reports:'SELECT id,site_id,name,dsl,created_at FROM reports WHERE site_id=$1',
 notification_channels:'SELECT id,site_id,kind FROM notification_channels WHERE site_id=$1',
 report_schedules:'SELECT id,site_id,report_id,channel_id,cadence,next_at,enabled FROM report_schedules WHERE site_id=$1',
 alert_rules:'SELECT id,site_id,kind,config,channel_id,next_at,consecutive,silenced_until,last_fired FROM alert_rules WHERE site_id=$1',
 notification_jobs:'SELECT id,site_id,channel_id,body,dedupe_key,status,attempts,next_at FROM notification_jobs WHERE site_id=$1',
 notification_logs:'SELECT id,job_id,site_id,success,created_at FROM notification_logs WHERE site_id=$1',
 share_links:'SELECT id,site_id,expires_at,revoked,frame_origins,created_at FROM share_links WHERE site_id=$1',
 audit_logs:'SELECT id,site_id,action,target,created_at FROM audit_logs WHERE site_id=$1',
 gsc_stats:'SELECT site_id,day,query,page,clicks,impressions,position FROM gsc_stats WHERE site_id=$1',
 ga_import:'SELECT site_id,day,source,pv,uv,sessions,imported_at FROM ga_import WHERE site_id=$1',
 seo_scans:'SELECT id,site_id,created_at,results FROM seo_scans WHERE site_id=$1',
 rank_history:'SELECT site_id,day,keyword,provider,position FROM rank_history WHERE site_id=$1',
 ai_budget:'SELECT site_id,month,reserved,used FROM ai_budget WHERE site_id=$1',
 ai_calls:'SELECT id,site_id,created_at,purpose,tokens,status,evidence,answer FROM ai_calls WHERE site_id=$1',
 ai_suggestions:'SELECT s.id,s.site_id,s.evidence_id,s.status,s.title,s.confidence,s.implemented_at,s.recheck,s.category,s.priority_score,s.priority_basis FROM ai_suggestions s JOIN ai_calls c ON c.id=s.evidence_id WHERE s.site_id=$1 AND c.site_id=$1',
 external_connections:'SELECT site_id,kind,settings,updated_at FROM external_connections WHERE site_id=$1',
 external_jobs:'SELECT site_id,kind,job_key,day,status,started_at,finished_at,attempts FROM external_jobs WHERE site_id=$1',
} as const;
const noDailyIdentity=new Set(['visitor_first_seen','identity_map','identity_bindings','identity_tombstones','experiment_assignments','experiment_contributions']);
const jsonColumns=new Set(['payload','dimensions','data','config','steps','variants','dsl','body','target','results','evidence','recheck','priority_basis','settings','tags']);
const secretKey=(key:string)=>/(?:password|secret|credential|authorization|encrypted|salt_secret|token_hash|access_token|refresh_token|api[_-]?key|license[_-]?key|write[_-]?key)/i.test(key);
const email=(value:unknown)=>typeof value==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export function scrubExportJson(value:unknown,dailySalt:boolean):unknown{
 if(Array.isArray(value))return value.filter(item=>!dailySalt||!email(item)).map(item=>scrubExportJson(item,dailySalt));
 if(!value||typeof value!=='object'||value instanceof Date)return value;
 const output:Record<string,unknown>=Object.create(null);
 for(const [key,item] of Object.entries(value)){
  if(secretKey(key)||dailySalt&&(stableIdentityKey(key)||email(item)))continue;
  // Joint dimension keys are JSON-encoded. Unsafe dimensions are not allowed to escape as key strings.
  if(dailySalt&&key.startsWith('{')){try{const parsed=JSON.parse(key);if(Object.keys(parsed).some(stableIdentityKey)||Object.values(parsed).some(email))continue;}catch{/* ordinary text key */}}
  output[key]=scrubExportJson(item,dailySalt);
 }
 return output;
}
export function scrubExportRows(table:string,rows:Record<string,unknown>[],dailySalt:boolean):Record<string,unknown>[] {
 if(dailySalt&&noDailyIdentity.has(table))return [];
 return rows.filter(row=>!(table==='event_data'&&(secretKey(String(row.data_key))||dailySalt&&(stableIdentityKey(String(row.data_key))||email(row.string_value))))).map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>!secretKey(key)&&!(dailySalt&&key==='user_id')).map(([key,value])=>[key,jsonColumns.has(key)?scrubExportJson(value,dailySalt):value])));
}
export async function readFullSiteFacts(client:PoolClient,siteId:string,dailySalt:boolean):Promise<Record<string,Record<string,unknown>[]>>{
 const result:Record<string,Record<string,unknown>[]>=Object.create(null);const sourceCounts:Record<string,number>=Object.create(null);
 const invalid=(await client.query(`SELECT EXISTS(SELECT 1 FROM ai_suggestions s JOIN ai_calls c ON c.id=s.evidence_id WHERE s.site_id=$1 AND c.site_id<>$1) OR EXISTS(SELECT 1 FROM experiment_contributions c JOIN experiments e ON e.id=c.experiment_id WHERE c.site_id=$1 AND e.site_id<>$1) OR EXISTS(SELECT 1 FROM notification_jobs j JOIN notification_channels c ON c.id=j.channel_id WHERE j.site_id=$1 AND c.site_id<>$1) OR EXISTS(SELECT 1 FROM notification_logs l JOIN notification_jobs j ON j.id=l.job_id WHERE l.site_id=$1 AND j.site_id<>$1) OR EXISTS(SELECT 1 FROM alert_rules r JOIN notification_channels c ON c.id=r.channel_id WHERE r.site_id=$1 AND c.site_id<>$1) OR EXISTS(SELECT 1 FROM report_schedules s JOIN reports r ON r.id=s.report_id JOIN notification_channels c ON c.id=s.channel_id WHERE s.site_id=$1 AND (r.site_id<>$1 OR c.site_id<>$1)) AS invalid`,[siteId])).rows[0];if(invalid.invalid)throw new Error('Export site relationship mismatch');
 for(const [table,query] of Object.entries(SITE_EXPORT_QUERIES)){
  const visitorTables=new Set(['sessions','visitor_first_seen','identity_map','identity_bindings','event_keys','revenue_orders','experiment_assignments','experiment_contributions']);const guarded=visitorTables.has(table)?`SELECT x.* FROM (${query}) x WHERE NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=$1 AND t.visitor_id=x.visitor_id)`:query;const rows=(await client.query(guarded+' LIMIT 100001',[siteId])).rows;
  if(rows.length>EXPORT_ROW_LIMIT)throw new Error('Export table exceeds 100000 rows');
  sourceCounts[table]=rows.length;result[table]=scrubExportRows(table,rows,dailySalt);
 }
 result.export_manifest=[{version:1,site_id:siteId,scope:'site-facts-and-nonsecret-configuration',row_limit:EXPORT_ROW_LIMIT,tables:Object.keys(SITE_EXPORT_QUERIES),core_tables:['site','events','storage'],source_row_counts:sourceCounts,exported_row_counts:Object.fromEntries(Object.entries(result).map(([table,rows])=>[table,rows.length])),excluded:['users','auth_sessions','site_members','api_tokens','site_invites','oauth_states','sso_config','sso_mappings','sso_states','instance_settings','instance_keyring','outbox','aggregation_state_leases','event_store_internal_state','export_jobs_and_files','credential_columns'],privacy_omissions:dailySalt?[...noDailyIdentity]:[],privacy_mode:dailySalt?'daily_salt':'standard',restore_policy:'Facts only. Reconfigure credentials and permissions; do not replay old jobs or leases. Apply independent deletion journal before serving restored data.'}];
 return result;
}
