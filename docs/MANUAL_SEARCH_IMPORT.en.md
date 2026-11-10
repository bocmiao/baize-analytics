# Manual custom search-analysis import

Manual import uses a Baize aggregate template. It does not directly read the Baidu Search Resource API or detect its native CSV format. Baidu Analytics search words, SERP and referrers do not replace organic-search impressions or ranking.

A site administrator opens **SEO → Custom search-analysis CSV**, downloads the [empty template](templates/custom-search-analysis.csv), and supplies authorized real aggregates. The template contains no demonstration statistics.

| Column | Required value |
|---|---|
| day | Valid YYYY-MM-DD date |
| query | Nonempty search query, at most 1,024 characters |
| page | Full HTTP(S) URL with hostname exactly equal to the site domain; no implicit www/subdomains, embedded credentials or nondefault port |
| clicks | Nonnegative safe integer, up to Number.MAX_SAFE_INTEGER |
| impressions | Nonnegative safe integer, no smaller than clicks |
| position | Finite nonnegative average position, at most 1,000,000 |

Use UTF-8 comma CSV. BOM, CRLF, quoted commas/newlines and escaped doubled quotes are supported. Limits: decoded CSV **5 MiB**, **100,000 data rows**, 100 columns and 8,192 characters per cell. JSON requests have a separate 32 MiB cap to accommodate CSV escaping. Binary Excel, semicolons, thousands separators, numeric formulas and automatic provider-format detection are unsupported.

1. Enter a source label. It is your declaration, not provider authentication. Upload your file.
2. Map the six fields to exact file headers. Empty/duplicate headers or mapping two target fields to one column are rejected. Other columns are ignored.
3. Acknowledge the custom-format boundary and select **Validate and preview**. The server validates the entire file and shows the first20 rows, actual count and date range. Any invalid value rejects the batch.
4. Select **Import separate batch**. The server reparses the original CSV; client-supplied parsed rows cannot bypass validation. Within a site, identical normalized rows, source label and mapping reuse the same SHA256-digest batch.
5. **View batch** shows up to1,000 rows with explicit truncation. Administrators can **Download safe CSV** for the complete batch. Formula-prefix cells, including whitespace/newline-prefixed formulas, receive an apostrophe to prevent spreadsheet execution. This is not a byte-identical original-file download.

URL queries/fragments are removed before storage. User-supplied paths, keywords or source labels can still contain sensitive material; aggregate format does not guarantee anonymity. Upload only authorized suitable data. The original whole file is not stored separately, but query text, source declaration, mapping and aggregates persist. The batch, rows and audit entry are transactional; audit metadata excludes query bodies.

Batches remain independent. Imports never replace another period or automatically sum overlapping batches/providers. Only `manual_search_imports` and `manual_search_rows` receive data, without modifying GSC, raw events, PV/UV, identities, orders or causal conversion measures. Site admins can preview/import/download; site-read members can inspect batches through the API; other sites are denied. Full PostgreSQL backups include the tables. Full-site JSON/CSV exports include these independent manual tables and batch metadata, excluding authentication and credentials; they still cannot replace a full database restore.

API prefix: `/api/sites/:siteId/manual-search`. GET lists imports; GET `/template` downloads headers; POST `/preview` and `/commit` take `{csv,label,mapping:{day,query,page,clicks,impressions,position},customTemplateAcknowledged:true}`; GET `/:id` reads a batch; GET `/:id/csv` downloads safe CSV. Lists cap at100 with explicit truncation; details cap at1,000 while reporting complete rowCount. Preview and commit both require site admin.
