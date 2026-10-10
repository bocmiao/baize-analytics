import {SHADOW_PROVENANCE_VERSION} from './canonical-shadow-provenance.js';
import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {stableIdentityKey,sanitizePrivacyProps} from '../../packages/tracker/src/privacy.js';
import {sanitizeCanonicalDailyEvent,CANONICAL_PRIVACY_POLICY_VERSION} from './canonical-privacy-cleanup.js';
import {getHistoryStore,rebaseDeletedHistory,verifyHistoryDailyColumns,type HistoryRow,type HistoryManifest} from './history-store.js';
import type {StoredEvent} from './clickhouse-store.js';
export function sanitizeDailyHistoryBody(row:HistoryRow):Record<string,unknown>{
 if(row.kind==='raw')return sanitizeCanonicalDailyEvent(row.body as unknown as StoredEvent) as unknown as Record<string,unknown>;
 if(!['hourly','daily'].includes(row.kind))return row.body;
 const body=structuredClone(row.body),data=body.data as Record<string,unknown>|undefined,events=data?.events as Record<string,{properties?:Record<string,Record<string,number>>}>|undefined;
 if(events)for(const event of Object.values(events)){if(!event.properties)continue;event.properties=Object.fromEntries(Object.entries(event.properties).filter(([key])=>!stableIdentityKey(key)).map(([key,values])=>[key,Object.fromEntries(Object.entries(values).filter(([value])=>Object.hasOwn(sanitizePrivacyProps({[key]:value}),key))) ]));}
 return body;
}
/** Sameclient site/P gate. Unique historical raw and unrelated aggregate members
 * survive; known aliases are physically rewritten and signed old copies revoked.
 * Retry after CH ACK+PG rollback recomputes digests from the surviving safe body. */
export async function sanitizeSiteHistoryPrivacy(client:PoolClient,pool:Pool,siteId:string){
 const site=(await client.query('SELECT privacy_mode,timezone FROM sites WHERE id=$1',[siteId])).rows[0];if(site?.privacy_mode!=='daily_salt')return {changed:0,verified:false};
 const manifests=(await client.query("SELECT manifest FROM history_manifests WHERE site_id=$1 AND status='published' ORDER BY id",[siteId])).rows.map(row=>row.manifest as HistoryManifest&{privacyPolicyVersion?:number;privacyProvenanceVersion?:number}).filter(manifest=>manifest.privacyPolicyVersion!==CANONICAL_PRIVACY_POLICY_VERSION||manifest.privacyProvenanceVersion!==SHADOW_PROVENANCE_VERSION);
 if(!manifests.length)return {changed:0,verified:true};const store=getHistoryStore(pool);if(!store)throw Error('HISTORY_PRIVACY_STORE_REQUIRED');
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`clickhouse:${siteId}`]);
 const table=`history_privacy_${randomUUID().replaceAll('-','')}`;await client.query(`CREATE TEMP TABLE ${table}(visitor_id text,page_id text,ts timestamptz) ON COMMIT DROP`);
 // Validate all source identities before the first physical mutation.
 for(const manifest of manifests){let offset=0;while(true){const rows=await store.read(manifest,100,offset);if(!rows.length)break;offset+=rows.length;await verifyHistoryDailyColumns(client,siteId,rows);const raw=rows.filter(row=>row.kind==='raw').map(row=>({visitor_id:row.body.visitor_id,page_id:row.body.page_id,ts:row.body.ts}));if(raw.length)await client.query(`INSERT INTO ${table} SELECT visitor_id,page_id,ts FROM jsonb_to_recordset($1) AS r(visitor_id text,page_id text,ts timestamptz)`,[JSON.stringify(raw)]);}}
 for(const key of ['visitor_id','page_id'])if((await client.query(`SELECT 1 FROM ${table} GROUP BY ${key} HAVING count(DISTINCT (ts AT TIME ZONE $1)::date)>1 LIMIT 1`,[site.timezone])).rowCount)throw Error('HISTORY_PRIVACY_LEGACY_IDENTITY_UNAVAILABLE');
 let changed=0;for(const manifest of manifests)changed+=await store.sanitizeBodies(manifest,sanitizeDailyHistoryBody);
 if(changed||manifests.some(manifest=>(manifest as HistoryManifest&{privacyPolicyVersion?:number;privacyProvenanceVersion?:number}).privacyPolicyVersion!==CANONICAL_PRIVACY_POLICY_VERSION))await client.query("UPDATE history_backup_files SET status='revoked',next_cleanup_at=now() WHERE site_id=$1 AND status IN('ready','writing')",[siteId]);
 // Always reconcile digests: the previous transaction may have rolled back after ACK.
 await rebaseDeletedHistory(client,pool,siteId,true,store);
 await client.query(`UPDATE history_manifests SET manifest=manifest||jsonb_build_object('privacyPolicyVersion',$2::int,'privacyProvenanceVersion',$3::int) WHERE site_id=$1 AND status='published'`,[siteId,CANONICAL_PRIVACY_POLICY_VERSION,SHADOW_PROVENANCE_VERSION]);
 return {changed,verified:true};
}
