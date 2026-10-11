# 059 unknown-origin operator guidance

`FACT_RAW_RETIREMENT_ORIGIN_UNKNOWN` means this upgraded site has no trustworthy evidence that expired raw history can be reconstructed. It does not mean historical sealed data was deleted. The strict worker refuses before owner, carry, hour-reference or coverage publication. Existing ownership is retained, but a dirty normal query must not report complete fresh coverage.

The worker now persists the fixed `FACT_RAW_RETIREMENT_ORIGIN_UNKNOWN` code for this refusal. The administrator jobs endpoint reports the stored classification and a safe recovery hint; classification status is not a claim that its seal or source bodies have been authenticated. Do not treat retry exhaustion as successful reaggregation.

Scope: unknown origin blocks strict CH source rebuilding before publication, and also blocks initializing a new valid 057 witness from a CH FULL. Ordinary PostgreSQL FULL is not blocked solely by `legacy_unknown` and cannot upgrade that marker. These rules do not guarantee dirty historical HTTP queries remain readable: normal dirty/source fences can reject them. Existing records and ownership are preserved, not relabeled complete.

## Read-only diagnosis

Using an existing authenticated administrator session, inspect the existing jobs endpoint:

```sh
curl --fail --silent --show-error -b "$ADMIN_COOKIE_FILE" "$BAIZE_BASE_URL/api/v1/sites/$SITE_ID/jobs"
```

Using already configured private operator environment variables (do not print them):

```sh
npx tsx scripts/canonical-cli.ts status "$SITE_ID"
```

The current CLI status reports canonical migration state, not an authenticated origin recovery decision. `migrate-facts`, `strict`, or jobs replay cannot create missing historical provenance. Do not clear the origin table, alter its classification, reset generation to fake clean, or remove old owner references.

## Supported safe continuation

If an independently verified signed backup actually contains a 059 `authenticated_new_site` origin or a `known_frontier` with its authentic 058 frontier, use the existing isolated restore procedure with all original signed namespace and body sidecars and the latest deletion journal. Restore must preserve the original classification and physical cutoff. A package containing `legacy_unknown` remains unknown; an old package without an origin cannot be interpreted as new.

The existing full-instance restore entry is:

```sh
BAIZE_RESTORE_CLICKHOUSE_URL="$INDEPENDENT_TARGET_CLICKHOUSE_URL" \
BAIZE_KEY_RESTORE_DIR="$INDEPENDENT_KEY_PACKAGE" \
  bash scripts/restore.sh "$BACKUP_DIRECTORY" baize_restore_SUFFIX
```

The target database and storage volume must not already exist. Use a genuinely independent target CH namespace, the matching private key fingerprint, complete `SHA256SUMS`, original canonical and all signed derived sidecars including the 059 scope, and the latest independently retained deletion journal and retention proof. Use a release/image that implements these scopes. This restores into isolation and does not switch traffic. A passing native isolated fixture does not establish that a newly built Docker image has passed.

For an old unknown site with no such evidence, there is currently no supported in-place CLI command that can safely promote it. Preserve its database, sealed body namespace, backups and owner references. Continue new tracking in a genuinely new site through the existing site-creation API:

```sh
curl --fail --silent --show-error -b "$ADMIN_COOKIE_FILE" \
  -H "Origin: $BAIZE_BASE_URL" -H 'Content-Type: application/json' \
  --data '{"name":"New tracking boundary","domain":"example.com","timezone":"UTC","privacy_mode":"standard","retention_days":365}' \
  "$BAIZE_BASE_URL/api/v1/sites"
```

Choose the real domain, timezone and privacy policy before creating it. Update the tracker configuration to the returned new site ID. Its first real FULL publication establishes the new-site origin; it does not recover the old site's lost raw window or merge historical totals. Do not delete the old site as part of this continuation.

An in-place recovery would require a new explicit, authenticated complete-source proof and owner-preserving rebuild protocol. That path is not implemented here and must not be represented by a force flag or an operator-supplied boolean.
