import type {PoolClient} from 'pg';
/** A fresh PG restore never inherits the live replica. Operators must configure a distinct target. */
export function restoreReplicaConfig(env:NodeJS.ProcessEnv){
 const fresh=Boolean(env.RESTORE_DATABASE),url=env.CLICKHOUSE_URL??'';
 if(!url)return undefined;
 if(fresh){if(env.RESTORE_CLICKHOUSE_EXPLICIT!=='1')throw new Error('Fresh restore requires an explicit isolated ClickHouse target');const target=new URL(url),source=env.RESTORE_SOURCE_CLICKHOUSE_URL?new URL(env.RESTORE_SOURCE_CLICKHOUSE_URL):undefined;if(source&&target.origin===source.origin&&target.pathname.replace(/\/+$/,'')===source.pathname.replace(/\/+$/,''))throw new Error('Restore ClickHouse target must differ from source endpoint');}
 return {url,username:env.CLICKHOUSE_USER??'default',password:env.CLICKHOUSE_PASSWORD??''};
}
export async function invalidateRestoredReplica(client:PoolClient){
 // Removing restored upload records prevents cleanup workers from deleting live
 // source snapshots when an operator later enables another replica endpoint.
 await client.query('DELETE FROM event_store_uploads');
 await client.query('DELETE FROM event_store_maintenance');
 await client.query("UPDATE event_store_state SET mode='postgres',snapshot_id=NULL,snapshot_epoch=NULL,snapshot_generation=-1,snapshot_count=0,captured_outbox_id=0,watermark=NULL,published_at=NULL,lease_owner=NULL,lease_until=NULL,attempts=0,last_error=NULL,dead_letter_at=NULL,next_attempt_at=now(),updated_at=now()");
}
