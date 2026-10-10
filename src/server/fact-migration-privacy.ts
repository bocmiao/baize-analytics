import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {canonical} from './security.js';
import {readOriginalColumnMetadata} from './canonical-shadow-provenance.js';
import {verifySessionEventHeaderRecords,type SessionEventHeaderRecord} from './session-event-headers.js';
import {sanitizeDailyDimensions,sanitizeDailyValue} from './daily-privacy-policy.js';
import type {ClickHouseSessionHeaderStore} from './session-header-store.js';
import {sanitizePrivacyProps} from '../../packages/tracker/src/privacy.js';

/** Migration may sign only an originally controlled daily producer closure.
 * A hash-shaped visitor is never evidence of anonymity. Missing legacy source
 * attestations refuse migration; this does not mutate or reinterpret the body. */
export async function assertPublishedDailyFactProvenance(c:PoolClient,site:string,run:string,store?:ClickHouseSessionHeaderStore){
 if((await c.query('SELECT privacy_mode FROM sites WHERE id=$1',[site])).rows[0]?.privacy_mode!=='daily_salt')return;
 const trusted='privacy_topology_'+randomUUID().replaceAll('-','');await c.query(`CREATE TEMP TABLE ${trusted}(LIKE analytics_session_event_headers INCLUDING DEFAULTS INCLUDING INDEXES) ON COMMIT DROP`);await c.query(`INSERT INTO ${trusted} SELECT * FROM analytics_session_event_headers WHERE run_id=$1`,[run]);
 if(store&&(await c.query("SELECT 1 FROM analytics_header_runs WHERE site_id=$1 AND run_id=$2 AND state='complete'",[site,run])).rowCount)for await(const batch of store.streamRows(c,site,run))await c.query(`INSERT INTO ${trusted} SELECT h.* FROM jsonb_populate_recordset(NULL::analytics_session_event_headers,$1) h ON CONFLICT DO NOTHING`,[JSON.stringify(batch)]);
 try{await verifyDailyClosure(c,site,run,trusted);}finally{await c.query(`DROP TABLE IF EXISTS ${trusted}`);}
}
async function verifyDailyClosure(c:PoolClient,site:string,run:string,trusted:string){
 const headers='privacy_headers_'+randomUUID().replaceAll('-','');
 await c.query(`DECLARE ${headers} NO SCROLL CURSOR FOR SELECT h.* FROM ${trusted} h WHERE run_id=$1 ORDER BY event_id`,[run]);
 try{for(;;){const rows=(await c.query(`FETCH 100 FROM ${headers}`)).rows as SessionEventHeaderRecord[];if(!rows.length)break;await verifySessionEventHeaderRecords(c,site,rows);for(const h of rows){const p=(await readOriginalColumnMetadata(c,site,h.event_id)).columnProof;if(p.privacyMode!=='daily_salt'||p.visitorId!==h.visitor_id||p.pageId!==h.page_id||p.ts!==new Date(h.event_ts).toISOString())throw Error('FACT_MIGRATION_DAILY_SOURCE_MISMATCH');if(canonical(sanitizeDailyDimensions(h.dimensions))!==canonical(h.dimensions)||canonical(sanitizeDailyValue(h.reducer_payload))!==canonical(h.reducer_payload))throw Error('FACT_MIGRATION_DAILY_UNSAFE_BODY');}}}finally{await c.query(`CLOSE ${headers}`);}
 // Every event contribution needs the original privately sealed topology,
 // including retained-independent centroids and property metrics.
 if((await c.query(`SELECT 1 FROM analytics_effect_facts e WHERE run_id=$1 AND NOT EXISTS(SELECT 1 FROM ${trusted} h WHERE h.run_id=e.run_id AND h.event_id=e.event_id AND h.visitor_id=e.visitor_id AND h.session_id=e.session_id AND h.event_ts=e.event_ts) LIMIT 1`,[run])).rowCount)throw Error('FACT_MIGRATION_DAILY_SOURCE_UNAVAILABLE');
 if((await c.query(`SELECT 1 FROM analytics_session_facts s WHERE run_id=$1 AND NOT EXISTS(SELECT 1 FROM ${trusted} h WHERE h.run_id=s.run_id AND h.session_id=s.session_id AND h.visitor_id=s.visitor_id) LIMIT 1`,[run])).rowCount)throw Error('FACT_MIGRATION_DAILY_SOURCE_UNAVAILABLE');
 const effects='privacy_effects_'+randomUUID().replaceAll('-','');await c.query(`DECLARE ${effects} NO SCROLL CURSOR FOR SELECT dimensions,metric,key FROM analytics_effect_facts WHERE run_id=$1`,[run]);
 try{for(;;){const rows=(await c.query(`FETCH 100 FROM ${effects}`)).rows;if(!rows.length)break;for(const row of rows){if(canonical(sanitizeDailyDimensions(row.dimensions))!==canonical(row.dimensions))throw Error('FACT_MIGRATION_DAILY_UNSAFE_BODY');if(row.metric==='property'&&!Object.hasOwn(sanitizePrivacyProps({[String(row.key[1])]:row.key[2]}),String(row.key[1])))throw Error('FACT_MIGRATION_DAILY_UNSAFE_BODY');}}}finally{await c.query(`CLOSE ${effects}`);}
 const sessions='privacy_sessions_'+randomUUID().replaceAll('-','');await c.query(`DECLARE ${sessions} NO SCROLL CURSOR FOR SELECT data FROM analytics_session_facts WHERE run_id=$1`,[run]);try{for(;;){const rows=(await c.query(`FETCH 100 FROM ${sessions}`)).rows;if(!rows.length)break;for(const row of rows)if(canonical(sanitizeDailyDimensions(row.data.dimensions))!==canonical(row.data.dimensions))throw Error('FACT_MIGRATION_DAILY_UNSAFE_BODY');}}finally{await c.query(`CLOSE ${sessions}`);}
}
