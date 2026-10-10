import type {PoolClient} from 'pg';
import type {StoredEvent} from './clickhouse-store.js';
import {canonicalEventChecksum} from './canonical-clickhouse.js';
import {sanitizeCanonicalDailyEvent,privacyReplacementId} from './canonical-privacy-cleanup.js';
import {readOriginalColumnMetadata,signTrustedReplacementContext,verifyTrustedReplacementContext,importVerifiedColumnProof,importOriginalColumnMetadata} from './canonical-shadow-provenance.js';
/** Preflight before any old-body ACK: authenticate exact old body and derive the
 * only permitted new body. Returned HMAC context rides the CH replacement row. */
export async function prepareTrustedReplacementProvenance(client:PoolClient,siteId:string,original:StoredEvent,replacement:StoredEvent){
 const metadata=await readOriginalColumnMetadata(client,siteId,original.event_id);if(metadata.bodyHash!==canonicalEventChecksum(original))throw Error('SHADOW_REPLACEMENT_ORIGINAL_BODY_MISMATCH');const expected={...sanitizeCanonicalDailyEvent(original),event_id:privacyReplacementId(original.event_id)};if(replacement.event_id!==expected.event_id||canonicalEventChecksum(replacement)!==canonicalEventChecksum(expected))throw Error('SHADOW_REPLACEMENT_TRANSFORM_INVALID');return signTrustedReplacementContext(client,{version:1,policyVersion:1,siteId,original:metadata,replacementId:replacement.event_id,replacementBodyHash:canonicalEventChecksum(replacement)});
}
/** Same TX after physical ACK, including recovery from authenticated CH orphan
 * metadata after PG rollback. No guessed source body or memory IP is minted. */
export async function recordTrustedReplacementProvenance(client:PoolClient,siteId:string,replacement:StoredEvent,encoded:string){
 const context=await verifyTrustedReplacementContext(client,siteId,encoded);if(context.replacementId!==replacement.event_id||context.replacementBodyHash!==canonicalEventChecksum(replacement)||canonicalEventChecksum(sanitizeCanonicalDailyEvent(replacement))!==canonicalEventChecksum(replacement))throw Error('SHADOW_REPLACEMENT_BODY_MISMATCH');const p=context.original.columnProof;if(p.visitorId!==replacement.visitor_id||p.pageId!==replacement.page_id.toLowerCase()||p.ts!==new Date(replacement.ts).toISOString())throw Error('SHADOW_REPLACEMENT_COLUMNS_MISMATCH');await importOriginalColumnMetadata(client,siteId,context.original);await importVerifiedColumnProof(client,replacement,p);await client.query('INSERT INTO canonical_provenance_replacements VALUES($1,$2,$3,$4) ON CONFLICT(site_id,replacement_event_id) DO NOTHING',[siteId,replacement.event_id,context.original.eventId,encoded]);return readOriginalColumnMetadata(client,siteId,replacement.event_id);
}
