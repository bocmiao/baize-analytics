/** Only explicit SELECT call sites opt in. The caller supplies its unchanged client timeout. */
export function configureClickHouseSelect(url: URL, effectiveTimeoutMs: number): void {
 url.searchParams.set('max_execution_time', String(effectiveTimeoutMs / 1000));
 url.searchParams.set('timeout_overflow_mode', 'throw');
}
