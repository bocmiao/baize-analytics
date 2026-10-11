import type {Pool,PoolClient} from 'pg';
import {assertCurrentFactRangeBacking} from './fact-range-backing.js';
import {verifyFactCoverageWitness} from './fact-coverage-witness.js';
import {assertFactRunClosure} from './fact-run-closure.js';
import {withRemainingFactReadSource} from './remaining-fact-source.js';
/** Only for an already authenticated original-cache bucket scope. Ordinary
 * retained-range evidence remains unchanged. A historical witness authorizes
 * the accepted snapshot, while CH source hydration still authenticates every
 * selected committed body. Future bucket padding is never future coverage. */
export async function assertCacheSnapshotRangeBacking(c:PoolClient,pool:Pool,site:string,from:string,to:string){
 try{return await assertCurrentFactRangeBacking(c,pool,site,from,to);}
 catch(error){
  // Do not convert corruption, authentication, malformed scope or transport
  // errors into a second source path. Only missing retained-range coverage
  // can request the separately authenticated historical witness.
  if(!(error instanceof Error)||error.message!=='FACT_RANGE_BACKING_UNAVAILABLE')throw error;
 }
 const witness=await verifyFactCoverageWitness(c,site,{from,to,bucketSnapshot:true});
 await assertFactRunClosure(c,site);
 return withRemainingFactReadSource(c,pool,site,async()=>witness);
}
