import type {PoolClient} from 'pg';
import {lockSessionHeaders} from './session-header-store.js';

/** Caller has synchronously acknowledged precise physical deletion and removed
 * victim members in this same transaction. Never use this to bypass that ACK.
 * The xact header barrier remains held through the caller's commit.
 */
export async function rebaseHeaderPublishedEpoch(client:PoolClient,siteId:string){
 await lockSessionHeaders(client,siteId);
 const invalid=(await client.query(`SELECT 1 FROM analytics_header_members m JOIN analytics_header_batches b ON b.id=m.batch_id WHERE b.site_id=$1 AND (EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=$1 AND t.visitor_id=m.visitor_id) OR EXISTS(SELECT 1 FROM identity_tombstones t WHERE t.site_id=$1 AND t.visitor_id=m.visitor_id AND t.started_at<=m.event_ts AND t.ended_at>m.event_ts)) LIMIT 1`,[siteId])).rowCount;
 if(invalid)throw Error('SESSION_HEADER_DELETION_NOT_ACKNOWLEDGED');
 await client.query(`UPDATE analytics_header_batches b SET aggregation_epoch=r.epoch FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id WHERE b.run_id=r.id AND b.site_id=$1 AND r.status='published' AND r.epoch=a.epoch`,[siteId]);
 await client.query(`UPDATE analytics_header_runs m SET aggregation_epoch=a.epoch,canonical_epoch=c.epoch,deletion_epoch=c.deletion_epoch,row_count=(SELECT count(*) FROM analytics_header_members h JOIN analytics_header_batches b ON b.id=h.batch_id WHERE b.site_id=m.site_id AND h.run_id=m.run_id) FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id LEFT JOIN canonical_event_authority c ON c.site_id=r.site_id WHERE m.run_id=r.id AND m.site_id=$1 AND r.status='published' AND r.epoch=a.epoch`,[siteId]);
}
