import type {DatabaseSync} from 'node:sqlite';
import type {AnalyticsEvent,Bucket} from '../server/analytics.js';
export interface LiteSite {id:string;name:string;domain:string;timezone:string;privacy_mode:'standard'|'daily_salt';retention_days:number;salt_secret:string;config:Record<string,unknown>;generation:number;epoch:string;owner_id:string}
export interface LiteUser {id:string;email:string;name:string;is_admin:boolean;password_hash?:string}
export interface LiteReceipt {siteId:string;eventId:string;wireHash:string;ts:number;visitorId:string;pageId:string;type:string;body:Record<string,unknown>;dimensions:Record<string,string>}
export interface LiteWriteContext {db:DatabaseSync;dataDir:string;keyDir:string;now:number}
export interface LiteSnapshot {site:LiteSite;events:AnalyticsEvent[];goals:Record<string,unknown>[];generation:number;epoch:string;archivedBuckets?:{hour:number;data:Bucket}[]}
export interface LiteCollectInput {siteId:string;origin:string;ip:string;ua:string;envelope:unknown;at:number;writeKey?:string;signature?:string}
export interface LiteCollectResult {accepted:number;duplicates:number;rejected:{event_id?:string;reason:string}[];clock_skew:boolean}
export interface LiteClaim {id:string;siteId:string;kind:string;token:string;epoch:string;generation:number;payload:Record<string,unknown>;attempts:number}
export interface LiteDomainRequest {kind:string;payload:Record<string,unknown>}
export interface LiteStorePort {call<T>(kind:string,payload?:Record<string,unknown>):Promise<T>;read<T>(kind:string,payload?:Record<string,unknown>,timeoutMs?:number):Promise<T>;freeze():Promise<void>;frozenIdentity():Promise<{dataDir:string;keyDir:string}>;unfreeze():void;backupDatabase(destination:string):Promise<void>;close():Promise<void>;runtime:Promise<{sqliteVersion:string;sourceId:string}>}
// Domain implementations run only inside the owner worker and must not await network I/O in a transaction.
export type LiteDomainHandler=(context:LiteWriteContext,kind:string,payload:Record<string,unknown>)=>unknown;

export type {BootstrapStatus} from './bootstrap-domain.js';
