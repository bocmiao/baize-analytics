import type {Pool} from 'pg';
import {runWorkerOnce} from '../src/server/worker.js';
interface RestoreState {site_id:string;generation:string;processed_generation:string;lease_owner:string|null;lease_until:Date|null;attempts:number;last_error:string|null;dead_letter_at:Date|null}
/** Worker false means no claim OR failed/fenced work. Only persisted state proves completion. */
export async function runRestoreRebuild(pool:Pool,worker:(pool:Pool)=>Promise<boolean>=runWorkerOnce,options:{maxRounds?:number}={}){
 const siteCount=Number((await pool.query('SELECT count(*)::integer n FROM sites')).rows[0].n);
 const maxRounds=options.maxRounds??Math.max(10,siteCount*4+10);if(!Number.isSafeInteger(maxRounds)||maxRounds<1)throw new Error('Invalid restore rebuild round bound');
 for(let round=0;round<=maxRounds;round++){
  const result=await pool.query<RestoreState>(`SELECT s.id AS site_id,a.generation::text,a.processed_generation::text,a.lease_owner::text,a.lease_until,a.attempts,a.last_error,a.dead_letter_at FROM sites s LEFT JOIN aggregation_state a ON a.site_id=s.id ORDER BY s.id`);
  const pending=result.rows.filter(s=>s.generation===null||BigInt(s.processed_generation)!==BigInt(s.generation)||s.lease_owner!==null||s.lease_until!==null||s.attempts!==0||s.last_error!==null||s.dead_letter_at!==null);
  if(!pending.length)return {sites:result.rows.length,rounds:round,verified:true as const};
  if(pending.some(s=>s.generation===null))throw new Error('Restore rebuild missing aggregation state; queries remain closed');
  if(pending.some(s=>s.dead_letter_at!==null||s.attempts>=3))throw new Error('Restore rebuild dead-letter failure; queries remain closed');
  if(round===maxRounds)throw new Error('Restore rebuild bounded retry exhausted; queries remain closed');
  // Failed transient attempts can be claimed again; never erase their error/attempt
  // history to manufacture success. An unclaimable live lease exhausts the bound.
  await worker(pool);
 }
 throw new Error('Unreachable restore rebuild state');
}
