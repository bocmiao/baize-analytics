# Application and database compatibility

| Application | Schema | Node | PostgreSQL | Redis | Rollback |
|---|---|---|---|---|---|
| 0.1.0 development | All current numbered migrations | 24 | 17 | 7 | Downtime snapshot restore, previous image, independent deletion-journal replay |

Numbered SQL migrations are append-only; PostgreSQL advisory locking elects the migration leader. This development version does not guarantee compatibility with every historical release. Changing an image tag alone does not roll back a database. Recovery requires the original master key and all versioned key files from a separately protected package, plus the current independent deletion journal. Validate destructive schema changes before upgrading.

The current event protocol is v1. Unknown versions are explicitly rejected. Update the supported application/schema matrix and any future protocol transition window only after regression verification.
