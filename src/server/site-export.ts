import {exportedPublishedSessions,exportedPublishedDefinitions,exportedPublishedRollups,exportedPublishedPageVitals} from './published-export-projections.js';
import {materializeCanonicalHeatmap} from './canonical-heatmap.js';
import {withRemainingFactReadSource} from './remaining-fact-source.js';
import {withCacheReadSource} from './cache-store-source.js';
import {factReadSql,factReadRelations} from './fact-read-context.js';
import type {Pool,PoolClient} from 'pg';
import type {StoredEvent} from './clickhouse-store.js';
import {readSiteEvents} from './event-store.js';
import {ApplicationError} from '../shared/error-codes.js';
import {stableIdentityKey} from '../../packages/tracker/src/privacy.js';
export const EXPORT_ROW_LIMIT=100000;
// Static SQL only. Runtime input can never select another relation or column.
export const SITE_EXPORT_QUERIES={
 manual_search_imports:'SELECT id,site_id,label,digest,mapping,start_day,end_day,row_count,created_at FROM manual_search_imports WHERE site_id=$1',
 manual_search_rows:'SELECT r.import_id,r.site_id,r.row_number,r.day,r.query,r.page,r.clicks,r.impressions,r.position FROM manual_search_rows r JOIN manual_search_imports i ON i.id=r.import_id AND i.site_id=r.site_id WHERE r.site_id=$1 AND i.site_id=$1',
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
 notification_jobs:"SELECT id,site_id,channel_id,body,dedupe_key,status,attempts,next_at FROM notification_jobs WHERE site_id=$1 AND (NOT(COALESCE(body->>'kind','') IN ('traffic','goal','funnel') OR COALESCE(dedupe_key,'') LIKE 'report:%') OR (body->>'aggregationEpoch'=(SELECT epoch::text FROM aggregation_state WHERE site_id=$1) AND status<>'revoked' AND COALESCE(body->>'invalidated','false')<>'true'))",
 notification_logs:'SELECT id,job_id,site_id,success,created_at FROM notification_logs WHERE site_id=$1',
 share_links:'SELECT id,site_id,expires_at,revoked,frame_origins,created_at FROM share_links WHERE site_id=$1',
 audit_logs:'SELECT id,site_id,action,target,created_at FROM audit_logs WHERE site_id=$1',
 gsc_stats:'SELECT site_id,day,query,page,clicks,impressions,position FROM gsc_stats WHERE site_id=$1',
 ga_import:'SELECT site_id,day,source,pv,uv,sessions,imported_at FROM ga_import WHERE site_id=$1',
 ga_import_windows:'SELECT site_id,start_day,end_day,property_id,property_timezone,data,imported_at FROM ga_import_windows WHERE site_id=$1',
 seo_scans:'SELECT id,site_id,created_at,results FROM seo_scans WHERE site_id=$1',
 rank_history:'SELECT site_id,day,keyword,provider,position FROM rank_history WHERE site_id=$1',
 ai_budget:'SELECT site_id,month,reserved,used FROM ai_budget WHERE site_id=$1',
 ai_calls:"SELECT c.id,c.site_id,c.created_at,c.purpose,c.tokens,c.status,c.evidence,c.answer FROM ai_calls c JOIN aggregation_state a ON a.site_id=c.site_id WHERE c.site_id=$1 AND c.evidence->'aggregation'->>'epoch'=a.epoch::text",
 ai_question_evidence:"SELECT q.call_id,q.site_id,q.evidence,q.created_at FROM ai_question_evidence q JOIN aggregation_state a ON a.site_id=q.site_id WHERE q.site_id=$1 AND jsonb_typeof(q.evidence->'tools')='array' AND jsonb_array_length(q.evidence->'tools')>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(q.evidence->'tools') t WHERE t->'result'->'storage'->>'epoch' IS DISTINCT FROM a.epoch::text)",
 ai_suggestions:"SELECT s.id,s.site_id,s.evidence_id,s.status,s.title,s.confidence,s.implemented_at,s.recheck,s.category,s.priority_score,s.priority_basis FROM ai_suggestions s JOIN ai_calls c ON c.id=s.evidence_id JOIN aggregation_state a ON a.site_id=c.site_id WHERE s.site_id=$1 AND c.site_id=$1 AND c.evidence->'aggregation'->>'epoch'=a.epoch::text",
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
// Reconstruct the legacy EAV contract from committed, sanitized event properties.
// Boolean true and string "true" remain distinct; unsupported values fail closed.
export function canonicalEventData(events:StoredEvent[],siteId:string):Record<string,unknown>[] {
 const rows:Record<string,unknown>[]=[];
 for(const event of events){
  if(event.site_id!==siteId)throw new ApplicationError('canonical_unavailable');
  const props=event.payload?.props;if(props===undefined)continue;
  if(props===null||typeof props!=='object'||Array.isArray(props))throw new ApplicationError('canonical_unavailable');
  for(const [key,value] of Object.entries(props)){
   const type=typeof value;if(type!=='string'&&type!=='boolean'&&!(type==='number'&&Number.isFinite(value)))throw new ApplicationError('canonical_unavailable');
   rows.push({site_id:siteId,event_id:event.event_id,ts:event.ts,data_key:key,data_type:type==='string'?'s':type==='boolean'?'b':'n',string_value:type==='string'?value:null,number_value:type==='number'?decimalString(value as number):null,boolean_value:type==='boolean'?value:null,date_value:null});
   if(rows.length>EXPORT_ROW_LIMIT)throw new Error('Export table exceeds 100000 rows');
  }
 }
 return rows;
}
function decimalString(value:number):string {
 const text=String(value);if(!/[eE]/.test(text))return text;
 const [mantissa,exponent]=text.split(/[eE]/);const negative=mantissa!.startsWith('-');const unsigned=negative?mantissa!.slice(1):mantissa!;const [whole,fraction='']=unsigned.split('.');const digits=whole!+fraction;const point=whole!.length+Number(exponent);
 return (negative?'-':'')+(point<=0?'0.'+'0'.repeat(-point)+digits:point>=digits.length?digits+'0'.repeat(point-digits.length):digits.slice(0,point)+'.'+digits.slice(point));
}
export async function readFullSiteFacts(client:PoolClient,siteId:string,dailySalt:boolean,options:{pool?:Pool;canonicalReplayRows?:Record<string,unknown>[];cacheBound?:boolean}={}):Promise<Record<string,Record<string,unknown>[]>>{
 if(options.pool&&!options.cacheBound)return withRemainingFactReadSource(client,options.pool,siteId,()=>readFullSiteFacts(client,siteId,dailySalt,{...options,cacheBound:true}));
 const result:Record<string,Record<string,unknown>[]>=Object.create(null);const sourceCounts:Record<string,number>=Object.create(null);
 const mode=(await client.query('SELECT authority,body_mode,epoch::text canonical_epoch,deletion_epoch::text FROM canonical_event_authority WHERE site_id=$1',[siteId])).rows[0];const authority=mode?.authority,strict=mode?.body_mode==='strict';
 const privacyFlags=(await client.query("SELECT kind,reason,from_ts,to_ts FROM analytics_cache_unavailable WHERE site_id=$1 AND reason='privacy_invalidated'",[siteId])).rows;const unsupported:Record<string,unknown>={};const flag=(kind:string)=>privacyFlags.filter(row=>row.kind===kind);
 let canonicalRows:Record<string,unknown>[]|undefined;let heatmapRead:Record<string,unknown>={source:'postgres',coverage:1};let eventDataRead:Record<string,unknown>={source:'postgres',method:'event_data_join_events',coverage:1};
 if(authority==='clickhouse'){
  if(!options.pool)throw new ApplicationError('canonical_unavailable');
  const read=await readSiteEvents(options.pool,siteId,{client,includeBots:true,limit:EXPORT_ROW_LIMIT});
  if(read.truncated)throw new Error('Export table exceeds 100000 rows');
  if(read.coverage!==1||read.authority!=='clickhouse')throw new ApplicationError('canonical_unavailable');
  canonicalRows=canonicalEventData(read.events,siteId);eventDataRead={source:read.source,method:'committed_sanitized_event_properties',coverage:read.coverage,epoch:read.epoch,deletion_epoch:read.deletionEpoch,watermark:read.watermark,retention_boundary:read.retentionBoundary};
 }
 const invalid=(await client.query(`SELECT EXISTS(SELECT 1 FROM ai_suggestions s JOIN ai_calls c ON c.id=s.evidence_id WHERE s.site_id=$1 AND c.site_id<>$1) OR EXISTS(SELECT 1 FROM experiment_contributions c JOIN experiments e ON e.id=c.experiment_id WHERE c.site_id=$1 AND e.site_id<>$1) OR EXISTS(SELECT 1 FROM notification_jobs j JOIN notification_channels c ON c.id=j.channel_id WHERE j.site_id=$1 AND c.site_id<>$1) OR EXISTS(SELECT 1 FROM notification_logs l JOIN notification_jobs j ON j.id=l.job_id WHERE l.site_id=$1 AND j.site_id<>$1) OR EXISTS(SELECT 1 FROM alert_rules r JOIN notification_channels c ON c.id=r.channel_id WHERE r.site_id=$1 AND c.site_id<>$1) OR EXISTS(SELECT 1 FROM report_schedules s JOIN reports r ON r.id=s.report_id JOIN notification_channels c ON c.id=s.channel_id WHERE s.site_id=$1 AND (r.site_id<>$1 OR c.site_id<>$1)) AS invalid`,[siteId])).rows[0];if(invalid.invalid)throw new Error('Export site relationship mismatch');
 for(const [table,query] of Object.entries(SITE_EXPORT_QUERIES)){
  const visitorTables=new Set(['sessions','visitor_first_seen','identity_map','identity_bindings','event_keys','revenue_orders','experiment_assignments','experiment_contributions']);const guarded=visitorTables.has(table)?`SELECT x.* FROM (${query}) x WHERE NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=$1 AND t.visitor_id=x.visitor_id)`:query;let rows:Record<string,unknown>[];
  if(strict&&(table==='stats_hourly'||table==='stats_daily')){const kind=table==='stats_hourly'?'hourly_rollup':'daily_rollup',flags=flag(kind);if(flags.length){rows=(await client.query(query+" AND data->>'relationalVersion'='2' LIMIT 100001",[siteId])).rows;unsupported[table]={coverage:0,reason:'privacy_invalidated_legacy_baseline',unavailable_ranges:flags,current_known_rows_available:true};}else{rows=(await client.query(query+' LIMIT 100001',[siteId])).rows;if(rows.some(row=>!(row.data as Record<string,unknown>).relationalVersion)){if(!options.pool)throw new ApplicationError('canonical_unavailable');rows=await withCacheReadSource(client,options.pool,siteId,async()=> (await client.query(factReadSql(client,query+' LIMIT 100001'),[siteId])).rows,{kinds:[kind]});}}}else if(strict&&table==='page_vitals'){rows=await exportedPublishedPageVitals(client,siteId);if(flag('page_centroid').length){unsupported[table]={coverage:0,reason:'privacy_invalidated_legacy_baseline',unavailable_ranges:flag('page_centroid'),current_known_rows_available:rows.length>0};if(!rows.length)continue;}}else if(strict&&table==='sessions')rows=await exportedPublishedSessions(client,siteId);else if(strict&&table==='analytics_definitions')rows=await exportedPublishedDefinitions(client,siteId);else if(authority==='clickhouse'&&table==='heatmap_points'){if(flag('heatmap_cache').length){unsupported[table]={coverage:0,reason:'privacy_invalidated_legacy_baseline',unavailable_ranges:flag('heatmap_cache'),omitted:true};heatmapRead={source:'unavailable',...unsupported[table] as Record<string,unknown>};continue;}if(!options.pool)throw new ApplicationError('canonical_unavailable');let heatmap;try{heatmap=await materializeCanonicalHeatmap(client,options.pool,siteId);}catch(error){if(error instanceof ApplicationError&&String(error.code)==='historical_coverage_unavailable'){unsupported[table]={coverage:0,reason:'privacy_invalidated_legacy_baseline',omitted:true};heatmapRead={source:'unavailable',...unsupported[table] as Record<string,unknown>};continue;}throw error;}try{rows=(await client.query(`SELECT * FROM ${heatmap.relation} LIMIT 100001`)).rows;heatmapRead=heatmap.metadata;}finally{await heatmap.cleanup()}}else if(authority==='clickhouse'&&table==='replay_chunks'){
   if(!options.canonicalReplayRows)throw new ApplicationError('canonical_unavailable');
   rows=options.canonicalReplayRows;if(rows.some(row=>row.site_id!==siteId))throw new ApplicationError('canonical_unavailable');
  }else if(options.pool&&['stats_hourly','stats_daily','page_vitals'].includes(table)){const kind=table==='stats_hourly'?'hourly_rollup':table==='stats_daily'?'daily_rollup':'page_centroid';if(flag(kind).length){unsupported[table]={coverage:0,reason:'privacy_invalidated_legacy_baseline',unavailable_ranges:flag(kind),omitted:true};continue;}rows=await withCacheReadSource(client,options.pool,siteId,async()=> (await client.query(factReadSql(client,guarded+' LIMIT 100001'),[siteId])).rows,{kinds:[kind]});}else rows=table==='event_data'&&canonicalRows!==undefined?canonicalRows:(await client.query(['stats_hourly','stats_daily','page_vitals'].includes(table)?factReadSql(client,guarded+' LIMIT 100001'):guarded+' LIMIT 100001',[siteId])).rows;
  if(rows.length>EXPORT_ROW_LIMIT)throw new Error('Export table exceeds 100000 rows');
  if(strict&&(table==='stats_hourly'||table==='stats_daily'))rows=await exportedPublishedRollups(client,siteId,table==='stats_hourly'?'hourly':'daily',rows);if(strict&&(table==='stats_hourly'||table==='stats_daily')&&unsupported[table]&&!rows.length){unsupported[table]={...unsupported[table] as Record<string,unknown>,omitted:true};continue;}
  sourceCounts[table]=rows.length;result[table]=scrubExportRows(table,rows,dailySalt);
 }
 const sourceVector=(await client.query('SELECT epoch::text,generation::text,processed_generation::text,watermark FROM aggregation_state WHERE site_id=$1',[siteId])).rows[0]??null;
 result.export_manifest=[{version:1,source_vector:{published_fact_source:factReadRelations(client).source??'postgres',authority:authority??'postgres',canonical_epoch:mode?.canonical_epoch??null,deletion_epoch:mode?.deletion_epoch??null,aggregation:sourceVector},site_id:siteId,scope:'site-facts-and-nonsecret-configuration',row_limit:EXPORT_ROW_LIMIT,row_limit_scope:'per_table',unsupported_tables:unsupported,table_read_metadata:{sessions:{method:strict?'authenticated_published_session_projection':'postgres_compatibility_sessions',coverage:1},analytics_definitions:{method:strict?'authenticated_published_definition_projection':'postgres_compatibility_definitions',coverage:1},heatmap_points:heatmapRead,stats_hourly:{method:strict?'current_authenticated_fact_projection':'authority_fenced_cache_or_relational_control',coverage:1,visitor_values_exported:!strict,...unsupported.stats_hourly as Record<string,unknown>},stats_daily:{method:strict?'current_authenticated_fact_projection':'authority_fenced_cache_or_relational_control',coverage:1,visitor_values_exported:!strict,...unsupported.stats_daily as Record<string,unknown>},page_vitals:{method:strict?'current_authenticated_vital_samples':'authority_fenced_sealed_centroid_or_explicit_legacy',coverage:1,...unsupported.page_vitals as Record<string,unknown>},event_data:eventDataRead,replay_chunks:authority==='clickhouse'?{source:'clickhouse',method:'canonical_committed_replay',coverage:1,created_at:'not_recorded'}:{source:'postgres',method:'replay_chunks',coverage:1}},tables:Object.keys(result),core_tables:['site','events','storage'],source_row_counts:sourceCounts,exported_row_counts:Object.fromEntries(Object.entries(result).map(([table,rows])=>[table,rows.length])),excluded:['users','auth_sessions','site_members','api_tokens','site_invites','oauth_states','sso_config','sso_mappings','sso_states','instance_settings','instance_keyring','ai_reservations','replay_retention_jobs','outbox','aggregation_state_leases','event_store_internal_state','export_jobs_and_files','credential_columns'],exclusion_reasons:{ai_reservations:'quota-ledger-operational-state',replay_retention_jobs:'retention-authorization-operational-state'},privacy_omissions:dailySalt?[...noDailyIdentity]:[],privacy_mode:dailySalt?'daily_salt':'standard',restore_policy:'Facts only. Reconfigure credentials and permissions; do not replay old jobs or leases. Apply independent deletion journal before serving restored data.'}];
 return result;
}
