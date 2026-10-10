import {createHmac,timingSafeEqual} from 'node:crypto';
import {open} from 'node:fs/promises';
import {dirname} from 'node:path';
import type {Pool,PoolClient} from 'pg';
import {scheduleCanonicalReplayRetention,replayRetentionScopeSql} from './canonical-replay-retention.js';
export interface ReplayRetentionProof {version:2;scope:'canonical-and-history-replay';sourceScope:string;issuedAt:string;sites:{siteId:string;cutoff:string}[];mac:string}
function signature(value:Omit<ReplayRetentionProof,'mac'>,key:Buffer){if(key.length<32)throw Error('REPLAY_RETENTION_PROOF_KEY_INVALID');return createHmac('sha256',key).update('baize-replay-retention-proof-v2\n').update(JSON.stringify(value)).digest('hex');}
/** Source-only capture. The caller must not hold another pool client or any gate. */
export async function captureLatestReplayRetention(pool:Pool,sourceScope:string,key:Buffer,at=new Date()):Promise<ReplayRetentionProof>{
 if(!sourceScope||sourceScope.length>1024||!Number.isFinite(+at))throw Error('REPLAY_RETENTION_PROOF_SOURCE_INVALID');
 await scheduleCanonicalReplayRetention(pool,at);
 const c=await pool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');const rows=(await c.query(`SELECT scope.site_id,j.cutoff FROM (${replayRetentionScopeSql}) scope LEFT JOIN replay_retention_jobs j ON j.site_id=scope.site_id ORDER BY scope.site_id LIMIT 5001`)).rows;if(rows.length>5000||rows.some(row=>!row.cutoff))throw Error('REPLAY_RETENTION_PROOF_INCOMPLETE');const body={version:2 as const,scope:'canonical-and-history-replay' as const,sourceScope,issuedAt:at.toISOString(),sites:rows.map(row=>({siteId:String(row.site_id),cutoff:new Date(row.cutoff).toISOString()}))};await c.query('COMMIT');return {...body,mac:signature(body,key)};}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
export function validateReplayRetentionProof(value:unknown,key:Buffer,options:{sourceScope:string;expectedSites:string[];at?:Date;maxAgeMs?:number}):ReplayRetentionProof{
 if(!value||typeof value!=='object')throw Error('REPLAY_RETENTION_PROOF_REQUIRED');const proof=value as ReplayRetentionProof;
 if(proof.version!==2||proof.scope!=='canonical-and-history-replay'||proof.sourceScope!==options.sourceScope||typeof proof.issuedAt!=='string'||typeof proof.mac!=='string'||!/^[a-f0-9]{64}$/.test(proof.mac)||!Array.isArray(proof.sites)||proof.sites.length>5000)throw Error('REPLAY_RETENTION_PROOF_INVALID');
 const issued=+new Date(proof.issuedAt),now=+(options.at??new Date()),maxAge=options.maxAgeMs??600000;if(!Number.isFinite(issued)||!Number.isFinite(now)||!Number.isFinite(maxAge)||maxAge<0||issued>now+1000||now-issued>maxAge)throw Error('REPLAY_RETENTION_PROOF_STALE');
 const sites:ReplayRetentionProof['sites']=[];for(const row of proof.sites){if(!row||typeof row.siteId!=='string'||!row.siteId||row.siteId.length>128||typeof row.cutoff!=='string'||!Number.isFinite(+new Date(row.cutoff))||+new Date(row.cutoff)>issued)throw Error('REPLAY_RETENTION_PROOF_INVALID');sites.push({siteId:row.siteId,cutoff:new Date(row.cutoff).toISOString()});}
 if(sites.some((row,i)=>i>0&&sites[i-1]!.siteId>=row.siteId)||JSON.stringify(sites.map(row=>row.siteId))!==JSON.stringify([...new Set(options.expectedSites)].sort()))throw Error('REPLAY_RETENTION_PROOF_INCOMPLETE');
 const body={version:2 as const,scope:'canonical-and-history-replay' as const,sourceScope:proof.sourceScope,issuedAt:proof.issuedAt,sites};const expected=signature(body,key);if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(proof.mac,'hex')))throw Error('REPLAY_RETENTION_PROOF_SIGNATURE_INVALID');return {...body,mac:proof.mac};
}
/** Target transaction, before restoring/exposing any body; never borrow another client. */
export async function validateAndMergeLatestReplayRetention(client:PoolClient,value:unknown,key:Buffer,options:{sourceScope:string;expectedSites:string[];at?:Date;maxAgeMs?:number}){
 const proof=validateReplayRetentionProof(value,key,options);for(const row of proof.sites)await client.query(`INSERT INTO replay_retention_jobs(site_id,cutoff,next_at,updated_at) VALUES($1,$2,$3,$3) ON CONFLICT(site_id) DO UPDATE SET cutoff=greatest(replay_retention_jobs.cutoff,excluded.cutoff),next_at=least(replay_retention_jobs.next_at,excluded.next_at),updated_at=excluded.updated_at`,[row.siteId,row.cutoff,options.at??new Date()]);return {verified:true,sites:proof.sites.length,sourceScope:proof.sourceScope,issuedAt:proof.issuedAt};
}
export async function writeReplayRetentionProof(path:string,proof:ReplayRetentionProof){const file=await open(path,'wx',0o600);try{await file.writeFile(JSON.stringify(proof));await file.sync();}finally{await file.close();}const directory=await open(dirname(path),'r');try{await directory.sync();}finally{await directory.close();}}
/** Source final check, without advancing/scheduling cutoffs. A changed source must
 * block a restore success/exposure marker, just like a changed deletion journal. */
export async function assertReplayRetentionProofCurrent(pool:Pool,value:unknown,key:Buffer,sourceScope:string,at=new Date()){
 const rows=(await pool.query(`SELECT scope.site_id,j.cutoff FROM (${replayRetentionScopeSql}) scope LEFT JOIN replay_retention_jobs j ON j.site_id=scope.site_id ORDER BY scope.site_id LIMIT 5001`)).rows;
 if(rows.length>5000||rows.some(row=>!row.cutoff))throw Error('REPLAY_RETENTION_PROOF_SOURCE_CHANGED');
 const proof=validateReplayRetentionProof(value,key,{sourceScope,expectedSites:rows.map(row=>String(row.site_id)),at});const current=rows.map(row=>({siteId:String(row.site_id),cutoff:new Date(row.cutoff).toISOString()}));if(JSON.stringify(current)!==JSON.stringify(proof.sites))throw Error('REPLAY_RETENTION_PROOF_SOURCE_CHANGED');return {verified:true,sites:current.length};
}

export const verifyReplayRetentionProofStillCurrent=assertReplayRetentionProofCurrent;
