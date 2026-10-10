import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {HistoryStore,rebaseDeletedHistory,type HistoryManifest} from './history-store.js';
import type {ReplayRetentionProof} from './canonical-replay-retention-proof.js';
/** After original archive checksum verification, before target commit/exposure.
 * Cursor-backed visitor scopes preserve mixed replay records after the cutoff. */
export async function applyRestoredHistoryReplayRetention(client:PoolClient,pool:Pool,store:HistoryStore,proof:ReplayRetentionProof){
 return applyHistoryReplayRetentionCutoffs(client,pool,store,proof.sites);
}
/** Caller already authenticated the monotonic cutoff ledger and holds site gates. */
export async function applyHistoryReplayRetentionCutoffs(client:PoolClient,pool:Pool,store:HistoryStore,sites:{siteId:string;cutoff:string}[]){
 let manifests=0;for(const site of sites){const list=(await client.query("SELECT manifest FROM history_manifests WHERE site_id=$1 AND status='published' ORDER BY id LIMIT 5001",[site.siteId])).rows;if(list.length>5000)throw Error('HISTORY_REPLAY_RETENTION_MANIFEST_LIMIT');for(const item of list){const manifest=item.manifest as HistoryManifest;const table='restore_replay_'+randomUUID().replaceAll('-','');await client.query(`CREATE TEMP TABLE ${table}(visitor_id text PRIMARY KEY) ON COMMIT DROP`);let offset=0;for(;;){const rows=await store.read(manifest,100,offset);if(!rows.length)break;offset+=rows.length;const visitors=[...new Set(rows.filter(row=>row.kind==='raw'&&row.body.type==='replay').map(row=>row.body.visitor_id))];if(visitors.some(v=>typeof v!=='string'||!v))throw Error('HISTORY_REPLAY_RETENTION_VISITOR_INVALID');if(visitors.length)await client.query(`INSERT INTO ${table} SELECT unnest($1::text[]) ON CONFLICT DO NOTHING`,[visitors]);}const cursor='restore_replay_visitors_'+randomUUID().replaceAll('-','');await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT visitor_id FROM ${table} ORDER BY visitor_id`);try{for(;;){const visitors=(await client.query(`FETCH 100 FROM ${cursor}`)).rows;if(!visitors.length)break;await store.redactReplayRecords(manifest,visitors.map(row=>({visitorId:row.visitor_id,to:site.cutoff})));}}finally{await client.query(`CLOSE ${cursor}`);}await client.query(`DROP TABLE ${table}`);manifests++;}await rebaseDeletedHistory(client,pool,site.siteId,true,store);}return {verified:true,manifests};
}
