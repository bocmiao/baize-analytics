import {createHmac,timingSafeEqual} from 'node:crypto';
import type {PoolClient} from 'pg';
import {canonical} from './security.js';
import type {DeletionRecord} from './deletion.js';
import type {CanonicalSegment} from './canonical-clickhouse.js';
export interface VerifiedDeletionAuthorization {version:1;siteId:string;scopeHash:string;signature:string}
const captured=new WeakMap<VerifiedDeletionAuthorization,{client:PoolClient;siteId:string}>();
function scopes(segments:CanonicalSegment[]){return [...new Set(segments.map(segment=>canonical({visitorId:segment.visitorId,from:segment.from?new Date(segment.from).toISOString():null,to:segment.to&&segment.to!=='infinity'?new Date(segment.to).toISOString():null})))].sort();}
function digest(secret:string,siteId:string,segments:CanonicalSegment[]){return createHmac('sha256',secret).update(canonical(['remaining-privacy-journal-scope-v1',siteId,scopes(segments)])).digest('hex');}
function signature(secret:string,authorization:Omit<VerifiedDeletionAuthorization,'signature'>){return createHmac('sha256',secret).update(canonical(['remaining-privacy-journal-authorization-v1',authorization])).digest('hex');}
/** Mint only after matching every actual record against the independent fsync
 * and watermark verified journal. Equivalent retries share the interval scope,
 * even when their newly appended record has a different deletion timestamp. */
export async function captureVerifiedDeletionAuthorization(client:PoolClient,siteId:string,dataDir:string,records:DeletionRecord[]):Promise<VerifiedDeletionAuthorization>{
 if(!records.length||records.some(record=>record.site_id!==siteId))throw Error('DELETION_AUTHORIZATION_JOURNAL_REQUIRED');
 const {readVerifiedDeletionRecords}=await import('./deletion.js');const actual=new Set((await readVerifiedDeletionRecords(dataDir)).map(record=>canonical(record)));if(records.some(record=>!actual.has(canonical(record))))throw Error('DELETION_AUTHORIZATION_JOURNAL_REQUIRED');
 const secret=(await client.query('SELECT salt_secret FROM sites WHERE id=$1',[siteId])).rows[0]?.salt_secret;if(!secret)throw Error('DELETION_AUTHORIZATION_SITE_REQUIRED');
 const segments=records.filter(record=>record.source==='identity-segment'||!record.visitor_id.startsWith('user:')).map(record=>({visitorId:record.visitor_id,from:record.started_at,to:record.ended_at==='infinity'?undefined:record.ended_at??undefined}));
 const unsigned={version:1 as const,siteId,scopeHash:digest(secret,siteId,segments)},authorization=Object.freeze({...unsigned,signature:signature(secret,unsigned)});captured.set(authorization,{client,siteId});return authorization;
}
/** A serialized signed context is authenticated, but is never permission to
 * delete on its own. Recovery callers additionally present a freshly captured
 * authorization from the current independent journal and compare scopeHash. */
export async function verifyDeletionAuthorization(client:PoolClient,siteId:string,authorization:VerifiedDeletionAuthorization,segments?:CanonicalSegment[]){
 if(authorization?.version!==1||authorization.siteId!==siteId||Object.keys(authorization).sort().join(',')!=='scopeHash,signature,siteId,version'||! /^[0-9a-f]{64}$/.test(authorization.scopeHash)||! /^[0-9a-f]{64}$/.test(authorization.signature))throw Error('DELETION_AUTHORIZATION_INVALID');
 const secret=(await client.query('SELECT salt_secret FROM sites WHERE id=$1',[siteId])).rows[0]?.salt_secret;if(!secret)throw Error('DELETION_AUTHORIZATION_INVALID');const {signature:given,...unsigned}=authorization,expected=signature(secret,unsigned);if(!timingSafeEqual(Buffer.from(given,'hex'),Buffer.from(expected,'hex'))||segments&&digest(secret,siteId,segments)!==authorization.scopeHash)throw Error('DELETION_AUTHORIZATION_INVALID');return authorization;
}
export function assertCurrentDeletionAuthorization(client:PoolClient,siteId:string,authorization:VerifiedDeletionAuthorization){const token=captured.get(authorization);if(!token||token.client!==client||token.siteId!==siteId)throw Error('DELETION_AUTHORIZATION_CURRENT_JOURNAL_REQUIRED');}
