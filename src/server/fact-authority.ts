/** Alias r is an analytics_fact_run and c is its site's optional canonical authority row.
 * A published aggregate does not require the raw backend to be online, but its provenance must
 * match the current authority and deletion barrier before being called current complete data.
 */
export const factAuthorityMatches=`((COALESCE(r.source_authority,'postgres')='postgres' AND COALESCE(c.authority,'postgres')='postgres') OR (r.source_authority='clickhouse' AND c.authority='clickhouse' AND r.canonical_epoch=c.epoch AND r.canonical_deletion_epoch=c.deletion_epoch))`;
