import type { Pool } from 'pg';
import { transaction, lockPartitionWrites } from './db.js';
const bound=(value:Date)=>value.toISOString().slice(0,10);
/** Convert default rows atomically, including cascade-backed EAV rows, without losing ids or attributes. */
export async function ensureMonthPartition(pool:Pool,month:Date){
  const start=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth(),1));const end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,1));
  const suffix=bound(start).slice(0,7).replace('-','_');const events=`events_${suffix}`,properties=`event_data_${suffix}`;
  return transaction(pool,async client=>{
    await lockPartitionWrites(client,true);
    if((await client.query("SELECT to_regclass(current_schema()||'.'||$1) AS relation",[events])).rows[0].relation)return false;
    // Exclusive schema gate precedes all relation locks and excludes intake/FK readers.
    await client.query('LOCK TABLE events,event_data IN ACCESS EXCLUSIVE MODE');
    await client.query('CREATE TEMP TABLE baize_event_buffer ON COMMIT DROP AS SELECT * FROM events_default WHERE ts >= $1 AND ts < $2',[start,end]);
    await client.query('CREATE TEMP TABLE baize_property_buffer ON COMMIT DROP AS SELECT * FROM event_data WHERE ts >= $1 AND ts < $2',[start,end]);
    await client.query('DELETE FROM events_default WHERE ts >= $1 AND ts < $2',[start,end]);
    await client.query(`CREATE TABLE ${events} PARTITION OF events FOR VALUES FROM ('${bound(start)}') TO ('${bound(end)}')`);
    await client.query(`CREATE TABLE ${properties} PARTITION OF event_data FOR VALUES FROM ('${bound(start)}') TO ('${bound(end)}')`);
    await client.query('INSERT INTO events SELECT * FROM baize_event_buffer');
    await client.query('INSERT INTO event_data SELECT * FROM baize_property_buffer');return true;
  });
}
export async function preparePartitions(pool:Pool,now=new Date()){
  let created=0;
  for(let offset=-12;offset<=2;offset++)if(await ensureMonthPartition(pool,new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+offset,1))))created++;
  return {created};
}
/** Retention deletes site records first. Never drop a shared partition if any site's valid records remain. */
export async function dropEmptyHistoricalPartitions(pool:Pool,now=new Date()){
  let dropped=0;const current=bound(new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1))).slice(0,7).replace('-','_');
  const rows=(await pool.query("SELECT c.relname FROM pg_partition_tree('events'::regclass) t JOIN pg_class c ON c.oid=t.relid WHERE t.isleaf")).rows;
  for(const row of rows){const name=String(row.relname);const match=/^events_(\d{4}_\d{2})$/.exec(name);if(!match||match[1]!>=current)continue;
    await transaction(pool,async client=>{await lockPartitionWrites(client,true);if(!(await client.query("SELECT to_regclass(current_schema()||'.'||$1) relation",[name])).rows[0].relation)return;await client.query('LOCK TABLE events,event_data IN ACCESS EXCLUSIVE MODE');if((await client.query(`SELECT 1 FROM ${name} LIMIT 1`)).rowCount)return;const props=`event_data_${match[1]}`;
      if((await client.query("SELECT to_regclass(current_schema()||'.'||$1) relation",[props])).rows[0].relation){await client.query(`ALTER TABLE event_data DETACH PARTITION ${props}`);await client.query(`DROP TABLE ${props}`);}
      await client.query(`ALTER TABLE events DETACH PARTITION ${name}`);await client.query(`DROP TABLE ${name}`);dropped++;
    });
  }return {dropped};
}
