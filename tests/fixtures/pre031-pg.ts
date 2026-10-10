// Historical schema <=014 PG adapter. It deliberately imports no current
// EventStore, canonical authority, deletion, or application query modules.
// This fixture exercises actual legacy rows and tombstones, never mock events.
import type {PoolClient} from 'pg';
import type {AnalyticsEvent} from './pre031-analytics.js';
export async function lockPartitionWrites(client:PoolClient){await client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended(current_schema()||':baize:partition-writes',92834110))");}
export async function beginPartitionSnapshot(client:PoolClient){await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await lockPartitionWrites(client);}
export async function readLegacyEvents(client:PoolClient,siteId:string,from:Date):Promise<AnalyticsEvent[]>{return (await client.query(`SELECT e.* FROM events e WHERE e.site_id=$1 AND e.ts>=$2 AND NOT e.is_bot AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=e.site_id AND t.visitor_id=e.visitor_id) AND NOT EXISTS(SELECT 1 FROM identity_tombstones t WHERE t.site_id=e.site_id AND t.visitor_id=e.visitor_id AND t.started_at<=e.ts AND t.ended_at>e.ts) ORDER BY e.ts,e.event_id`,[siteId,from])).rows;}
