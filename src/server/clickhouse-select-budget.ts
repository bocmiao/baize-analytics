import {ApplicationError} from '../shared/error-codes.js';
import {reserveStatsSelect,statsReadRemainingMs} from './stats-read-budget.js';
/** Only explicit SELECT call sites opt in. The caller supplies its unchanged client timeout. */
export function configureClickHouseSelect(url: URL, effectiveTimeoutMs: number): void {
 reserveStatsSelect();const remaining=statsReadRemainingMs();const timeout=remaining===undefined?effectiveTimeoutMs:Math.min(effectiveTimeoutMs,remaining);
 url.searchParams.set('max_execution_time', String(timeout / 1000));
 url.searchParams.set('timeout_overflow_mode', 'throw');
}

/** Inspect only the server envelope/JSONEachRow terminal object, never application field strings. */
export function parseClickHouseSelectJson<T=Record<string,unknown>>(text:string):T{const parsed:unknown=JSON.parse(text);if(parsed&&typeof parsed==='object'&&Object.hasOwn(parsed,'exception')){const exception=(parsed as {exception:unknown}).exception;if(exception!==null&&exception!==undefined&&exception!=='')throw new ApplicationError('canonical_unavailable');}return parsed as T;}
