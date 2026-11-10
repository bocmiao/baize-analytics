import {structuralSelector} from '../../packages/tracker/src/visual-model.js';
import {ApplicationError} from '../shared/error-codes.js';
import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {getCanonicalStore} from './canonical-clickhouse.js';
import {captureEventReadState} from './event-store.js';
import {prepareCacheReadSource} from './cache-store-source.js';
import {cacheRowKey} from './cache-store.js';
import type {FactSourceOptions} from './fact-store-source.js';

const pointSchema=z.object({kind:z.enum(['click','scroll']),x:z.number().min(0).max(1),y:z.number().min(0).max(1),width:z.number().int().min(1).max(20000),height:z.number().int().min(1).max(20000),element:z.string().max(512).regex(structuralSelector).optional(),document_height:z.number().int().min(1).max(200000).optional(),document_width:z.number().int().min(1).max(20000).optional()}).strict();
/** Caller keeps P/site gates and one RR transaction. Exact counts spill to PG TEMP,
 * never an all-site JS map. Coverage is per immutable raw batch and base point:
 * a late event is counted unless its committed batch belongs to that point's base.
 */
export async function materializeCanonicalHeatmap(c:PoolClient,pool:Pool,site:string,options:{baseRelation?:string;sourceOptions?:FactSourceOptions}={}){
 const metadata=await captureEventReadState(pool,site,{client:c});
 if(metadata.authority!=='clickhouse')return {relation:'heatmap_points',metadata,cleanup:async()=>{}};
 const store=getCanonicalStore(pool);if(!store)throw Error('CANONICAL_UNAVAILABLE');
 let source:Awaited<ReturnType<typeof prepareCacheReadSource>>|null;
 try{source=options.baseRelation?null:await prepareCacheReadSource(c,pool,site,{...options.sourceOptions,kinds:['heatmap_cache']});}catch(error){if(error instanceof Error&&error.message==='CACHE_BASELINE_UNAVAILABLE')throw new ApplicationError('historical_coverage_unavailable');throw error;}
 const base=options.baseRelation??source!.heatmapRelation;
 if(!/^(?:(?:[a-zA-Z_][a-zA-Z_0-9]*|"[a-zA-Z_0-9]+")\.)?[a-zA-Z_][a-zA-Z_0-9]*$/.test(base))throw Error('HEATMAP_SOURCE_IDENTIFIER');
 const table='heatmap_read_'+randomUUID().replaceAll('-','');
 try{
  await c.query(`CREATE TEMP TABLE ${table}(LIKE heatmap_points INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES) ON COMMIT DROP`);
  await c.query(`INSERT INTO ${table} SELECT * FROM ${base} WHERE site_id=$1`,[site]);
  if(source?.source==='postgres'&&(await c.query(`SELECT 1 FROM ${table} LIMIT 1`)).rowCount)throw Error('CACHE_HEATMAP_BASE_NOT_MIGRATED');
  const retention=(await c.query('SELECT retention_days FROM sites WHERE id=$1',[site])).rows[0];
  const cutoff=Date.now()-Number(retention?.retention_days??90)*86400000;
  for await(const events of store.streamCommitted(c,site,{snapshotEpoch:metadata.canonicalEpoch})){
   if(events.length>1000)throw Error('HEATMAP_BATCH_LIMIT');
   const points=events.filter(event=>event.type==='heatmap'&&+new Date(event.ts)>=cutoff).map(event=>{
    const point=pointSchema.parse(event.payload.heatmap);
    const row={site_id:site,path:event.path,kind:point.kind,x:Math.round(point.x*100),y:Math.round(point.y*100),viewport:Math.round(point.width/100)*100};
    return {...row,event_id:event.event_id,row_key:cacheRowKey('heatmap_cache',row)};
   });
   if(!points.length)continue;
   // Raw manifests are the acceptance whitelist; physical orphan attempts never
   // become visible. Pointer-specific coverage avoids suppressing another point.
   await c.query(`INSERT INTO ${table}(site_id,path,kind,x,y,viewport,count)
    SELECT $1,p.path,p.kind,p.x,p.y,p.viewport,count(*)
    FROM jsonb_to_recordset($2::jsonb) AS p(event_id uuid,row_key text,path text,kind text,x integer,y integer,viewport integer)
    JOIN canonical_event_members m ON m.site_id=$1 AND m.event_id=p.event_id
    WHERE NOT EXISTS(SELECT 1 FROM analytics_cache_pointers owner
      JOIN cache_heatmap_coverage_batches cover ON cover.site_id=owner.site_id AND cover.owner_id=owner.owner_id
      WHERE owner.site_id=$1 AND owner.kind='heatmap_cache' AND owner.row_key=p.row_key AND cover.batch_id=m.batch_id
        AND cover.canonical_epoch=$3 AND cover.deletion_epoch=$4::bigint)
      AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=$1 AND t.visitor_id=m.visitor_id)
      AND NOT EXISTS(SELECT 1 FROM identity_tombstones t WHERE t.site_id=$1 AND t.visitor_id=m.visitor_id AND t.started_at<=m.ts AND t.ended_at>m.ts)
    GROUP BY p.path,p.kind,p.x,p.y,p.viewport
    ON CONFLICT(site_id,path,kind,x,y,viewport) DO UPDATE SET count=${table}.count+excluded.count`,[site,JSON.stringify(points),metadata.canonicalEpoch,metadata.canonicalDeletionEpoch]);
  }
  return {relation:`pg_temp.${table}`,metadata,cleanup:async()=>{await c.query(`DROP TABLE IF EXISTS ${table}`);await source?.cleanup();}};
 }catch(error){await c.query(`DROP TABLE IF EXISTS ${table}`).catch(()=>undefined);await source?.cleanup().catch(()=>undefined);throw error;}
}
