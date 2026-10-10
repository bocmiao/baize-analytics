import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {factReadRelations,type FactReadRelations} from './fact-read-context.js';
const bodies={effectsRelation:'analytics_effect_facts',vitalsRelation:'analytics_vital_samples',sessionsRelation:'analytics_session_facts',numericsRelation:'analytics_numeric_facts',membersRelation:'analytics_member_facts',carryCheckpointsRelation:'analytics_carry_checkpoints',carryKeysRelation:'analytics_carry_keys'} as const;
/** Keep publication inputs on the same physical connection across RR COMMIT.
 * Copies spill to PG TEMP, never an all-run JS array. Persistent staging bodies
 * are removed in that source transaction only after 043/044/047 durable ACKs.
 * Process loss discards TEMP; the unchanged generation/outbox is rebuilt. */
export async function preserveStrictPublicationStaging(c:PoolClient,site:string,run:string):Promise<{relations:FactReadRelations;cleanup:()=>Promise<void>}>{
 const old=factReadRelations(c),names:string[]=[],relations:FactReadRelations={effectsRelation:'',vitalsRelation:'',source:'clickhouse'};
 for(const [key,table] of Object.entries(bodies) as [keyof typeof bodies,string][]){const name='strict_publish_'+randomUUID().replaceAll('-','');names.push(name);await c.query(`CREATE TEMP TABLE ${name} ON COMMIT PRESERVE ROWS AS SELECT * FROM ${table} WHERE run_id=$1`,[run]);
  // Head retirement needs old session last-active evidence, independently of
  // whether its authoritative body is PG legacy or authenticated CH TEMP.
  if(key==='sessionsRelation'&&old.sessionsRelation&&old.sessionsRelation!==table)await c.query(`INSERT INTO ${name} SELECT * FROM ${old.sessionsRelation} WHERE run_id<>$1`,[run]);
  relations[key]='pg_temp.'+name;
 }
 const complete=(await c.query(`SELECT (SELECT count(*) FROM analytics_fact_store_runs WHERE run_id=$1 AND state='complete')=2 AND (SELECT count(*) FROM analytics_remaining_fact_runs WHERE run_id=$1 AND state='complete')=5 AND EXISTS(SELECT 1 FROM analytics_header_runs WHERE site_id=$2 AND run_id=$1 AND state='complete') valid`,[run,site])).rows[0]?.valid;if(!complete)throw Error('FACT_STRICT_STAGING_NOT_ACKNOWLEDGED');
 for(const table of Object.values(bodies))await c.query(`DELETE FROM ${table} WHERE run_id=$1`,[run]);await c.query('DELETE FROM analytics_vitals_facts WHERE run_id=$1',[run]);
 return {relations,cleanup:async()=>{await c.query(`DROP TABLE IF EXISTS ${names.join(',')}`)}};
}
