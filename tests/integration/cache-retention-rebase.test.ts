import {it,expect} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {rebaseCacheAfterRawRetention} from '../../src/server/cache-retention-rebase.js';
it.skipIf(!process.env.TEST_DATABASE_URL)('real PG rebase preserves sealed source and excludes stale, staging and other-site owners',async()=>{
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});const c=await pool.connect();
 const site=randomUUID(),other=randomUUID(),epoch=randomUUID(),agg=randomUUID();
 try{await c.query('BEGIN');
 await c.query('CREATE TEMP TABLE canonical_event_authority(site_id uuid,authority text,epoch uuid,deletion_epoch bigint)');
 await c.query('CREATE TEMP TABLE aggregation_state(site_id uuid,epoch uuid)');
 await c.query('CREATE TEMP TABLE analytics_cache_owners(id text,site_id uuid,state text,aggregation_epoch uuid,live_canonical_epoch uuid,live_deletion_epoch bigint,canonical_epoch uuid,deletion_epoch bigint,source_aggregation_epoch uuid,body_hash text,attempt_id uuid)');
 await c.query("INSERT INTO canonical_event_authority VALUES($1,'clickhouse',$2,8),($3,'clickhouse',$2,8)",[site,epoch,other]);await c.query('INSERT INTO aggregation_state VALUES($1,$2),($3,$2)',[site,agg,other]);
 for(const [id,state,live,ownerSite,ownerAgg]of [['valid','complete',7,site,agg],['stale','complete',6,site,agg],['staging','staging',7,site,agg],['other','complete',7,other,agg],['old-aggregation','complete',7,site,randomUUID()]] as const)await c.query('INSERT INTO analytics_cache_owners VALUES($1,$2,$3,$4,$5,$6,$5,3,$4,$7,$8)',[id,ownerSite,state,ownerAgg,epoch,live,'sealed-hash',randomUUID()]);
 const before=(await c.query('SELECT * FROM analytics_cache_owners ORDER BY id')).rows;
 expect(await rebaseCacheAfterRawRetention(c,site,{canonicalEpoch:epoch,deletionEpoch:'7',aggregationEpoch:agg},'8')).toBe(1);
 const after=(await c.query('SELECT * FROM analytics_cache_owners ORDER BY id')).rows;
 for(let i=0;i<before.length;i++)expect(after[i]).toEqual({...before[i],live_deletion_epoch:before[i].id==='valid'?'8':before[i].live_deletion_epoch});
 }finally{await c.query('ROLLBACK');c.release();await pool.end();}
});
