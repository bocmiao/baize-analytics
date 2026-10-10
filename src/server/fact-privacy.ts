import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {sanitizePrivacyProps} from '../../packages/tracker/src/privacy.js';

/** Uses the tracker privacy policy, preserving non-identifying archive contributors. Caller holds the site barrier. */
export async function sanitizeDailyFactProperties(client:PoolClient,siteId:string):Promise<{removed:number}>{
 const site=(await client.query('SELECT privacy_mode FROM sites WHERE id=$1',[siteId])).rows[0];if(site?.privacy_mode!=='daily_salt')return {removed:0};
 const suffix=randomUUID().replaceAll('-',''),bad=`privacy_keys_${suffix}`,cursor=`privacy_cursor_${suffix}`;
 await client.query(`CREATE TEMP TABLE ${bad}(event text,property text,value text,PRIMARY KEY(event,property,value)) ON COMMIT DROP`);
 const rollup=(table:string)=>`SELECT ev.key AS event,p.key AS property,v.key AS value FROM ${table} h CROSS JOIN LATERAL jsonb_each(COALESCE(h.data->'events','{}')) ev CROSS JOIN LATERAL jsonb_each(COALESCE(ev.value->'properties','{}')) p CROSS JOIN LATERAL jsonb_each(p.value) v WHERE h.site_id=$1`;
 await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT key->>0 AS event,key->>1 AS property,key->>2 AS value FROM analytics_effect_facts e JOIN analytics_fact_runs r ON r.id=e.run_id WHERE r.site_id=$1 AND metric='property' UNION SELECT key->>0,key->>1,key->>2 FROM analytics_numeric_facts e JOIN analytics_fact_runs r ON r.id=e.run_id WHERE r.site_id=$1 AND metric='property' UNION ${rollup('stats_hourly')} UNION ${rollup('stats_daily')}`,[siteId]);
 let removed=0;
 try{while(true){const rows=(await client.query(`FETCH FORWARD 100 FROM ${cursor}`)).rows;if(!rows.length)break;const rejected=rows.filter(row=>!Object.hasOwn(sanitizePrivacyProps({[row.property]:row.value}),row.property));if(rejected.length){removed+=rejected.length;await client.query(`INSERT INTO ${bad} SELECT event,property,value FROM jsonb_to_recordset($1) p(event text,property text,value text) ON CONFLICT DO NOTHING`,[JSON.stringify(rejected)]);}}}finally{await client.query(`CLOSE ${cursor}`);}
 if(!removed)return {removed:0};
 for(const table of ['analytics_effect_facts','analytics_numeric_facts'])await client.query(`DELETE FROM ${table} e USING analytics_fact_runs r,${bad} b WHERE r.id=e.run_id AND r.site_id=$1 AND e.metric='property' AND e.key->>0=b.event AND e.key->>1=b.property AND e.key->>2=b.value`,[siteId]);
 for(const table of ['stats_hourly','stats_daily'])await client.query(`UPDATE ${table} h SET data=h.data||jsonb_build_object('events',COALESCE((SELECT jsonb_object_agg(ev.key,ev.value||jsonb_build_object('properties',COALESCE((SELECT jsonb_object_agg(p.key,clean.values) FROM jsonb_each(COALESCE(ev.value->'properties','{}')) p CROSS JOIN LATERAL(SELECT jsonb_object_agg(v.key,v.value) AS values FROM jsonb_each(p.value) v WHERE NOT EXISTS(SELECT 1 FROM ${bad} b WHERE b.event=ev.key AND b.property=p.key AND b.value=v.key)) clean WHERE clean.values IS NOT NULL),'{}'::jsonb))) FROM jsonb_each(COALESCE(h.data->'events','{}')) ev),'{}'::jsonb)) WHERE h.site_id=$1`,[siteId]);
 return {removed};
}
