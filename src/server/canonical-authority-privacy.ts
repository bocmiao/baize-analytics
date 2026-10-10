import type {PoolClient} from 'pg';
export interface DailyAuthorityProof {
 version:1;siteId:string;authorityEpoch:string;validatedDailyColumnsVersion:1;
 validatedPrivacyMode:'daily_salt';validatedGeneration:string;validatedDeletionEpoch:string;
 currentGeneration:string;currentDeletionEpoch:string;validatedAt:string;
}
/** This metadata is necessary, not sufficient: callers must also verify every
 * retained raw body's controlled column seal and sign the package with v1 key. */
export async function captureValidatedDailyAuthority(client:PoolClient,siteId:string):Promise<DailyAuthorityProof|undefined>{
 const mode=(await client.query('SELECT privacy_mode FROM sites WHERE id=$1',[siteId])).rows[0]?.privacy_mode;
 if(mode==='standard')return undefined;if(mode!=='daily_salt')throw Error('CANONICAL_PRIVACY_SITE_REQUIRED');
 const row=(await client.query("SELECT a.epoch::text,a.deletion_epoch::text,s.generation::text,p.epoch::text AS validation_epoch,p.validated_generation::text,p.validated_deletion_epoch::text,p.validated_at,p.validated_privacy_mode,p.validated_daily_columns_version FROM canonical_event_authority a JOIN canonical_migration_progress p USING(site_id) JOIN aggregation_state s USING(site_id) WHERE a.site_id=$1 AND a.authority='clickhouse'",[siteId])).rows[0];
 if(!row||row.epoch!==row.validation_epoch||row.validated_privacy_mode!=='daily_salt'||row.validated_daily_columns_version!==1||!row.validated_at||row.validated_generation===null||row.validated_deletion_epoch===null||BigInt(row.validated_generation)>BigInt(row.generation)||BigInt(row.validated_deletion_epoch)>BigInt(row.deletion_epoch))throw Error('CANONICAL_PRIVACY_PROVENANCE_REQUIRED');
 return {version:1,siteId,authorityEpoch:row.epoch,validatedDailyColumnsVersion:1,validatedPrivacyMode:'daily_salt',validatedGeneration:row.validated_generation,validatedDeletionEpoch:row.validated_deletion_epoch,currentGeneration:row.generation,currentDeletionEpoch:row.deletion_epoch,validatedAt:new Date(row.validated_at).toISOString()};
}
/** Use only after package signature verification; the source epoch is retained
 * in the package even when restoration creates a different target epoch. */
export function verifyValidatedDailyAuthority(proof:unknown,expected:{siteId:string;sourceEpoch:string}):asserts proof is DailyAuthorityProof{
 const p=proof as Partial<DailyAuthorityProof>|undefined;
 if(!p||p.version!==1||p.siteId!==expected.siteId||p.authorityEpoch!==expected.sourceEpoch||p.validatedDailyColumnsVersion!==1||p.validatedPrivacyMode!=='daily_salt'||![p.validatedGeneration,p.validatedDeletionEpoch,p.currentGeneration,p.currentDeletionEpoch].every(value=>typeof value==='string'&&/^\d+$/.test(value))||!p.validatedAt||!Number.isFinite(+new Date(p.validatedAt)))throw Error('CANONICAL_PRIVACY_PROVENANCE_REQUIRED');
 if(BigInt(p.validatedGeneration!)>BigInt(p.currentGeneration!)||BigInt(p.validatedDeletionEpoch!)>BigInt(p.currentDeletionEpoch!))throw Error('CANONICAL_PRIVACY_PROVENANCE_REQUIRED');
}
/** Caller has verified the source package HMAC and every retained body seal,
 * holds the target site gate, and has not exposed/committed the restored site. */
export async function restoreValidatedDailyAuthority(client:PoolClient,proof:DailyAuthorityProof,targetEpoch:string){
 verifyValidatedDailyAuthority(proof,{siteId:proof.siteId,sourceEpoch:proof.authorityEpoch});
 const row=(await client.query("SELECT a.deletion_epoch::text,s.generation::text FROM canonical_event_authority a JOIN aggregation_state s USING(site_id) JOIN sites t ON t.id=a.site_id WHERE a.site_id=$1 AND a.epoch=$2 AND a.authority='clickhouse' AND t.privacy_mode='daily_salt' FOR UPDATE OF a",[proof.siteId,targetEpoch])).rows[0];
 if(!row)throw Error('CANONICAL_PRIVACY_RESTORE_FENCE');
 await client.query("INSERT INTO canonical_migration_progress(site_id,epoch,phase,validated_generation,validated_deletion_epoch,validated_at,validated_privacy_mode,validated_daily_columns_version) VALUES($1,$2,'validated',$3,$4,now(),'daily_salt',1) ON CONFLICT(site_id) DO UPDATE SET epoch=excluded.epoch,phase=excluded.phase,validated_generation=excluded.validated_generation,validated_deletion_epoch=excluded.validated_deletion_epoch,validated_at=excluded.validated_at,validated_privacy_mode=excluded.validated_privacy_mode,validated_daily_columns_version=excluded.validated_daily_columns_version",[proof.siteId,targetEpoch,row.generation,row.deletion_epoch]);
}
