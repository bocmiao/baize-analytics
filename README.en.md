# Baize Analytics

Free self-hosted, privacy-oriented website analytics with a Chinese-first UI. TypeScript, Fastify, React/Vite, PostgreSQL and Redis. All product features are free; operators pay for their own external AI/SERP services.

This is a private development repository. Feature acceptance is recorded separately from design documents. No public release, registry image publication or external deployment is performed by this workflow.

Install Docker and Compose v2, then run `./install.sh` in the existing checkout. The app listens on localhost:3000. Create the first administrator and website in the setup wizard. Secrets are generated locally and preserved on repeated installation.

See docs/deployment.md for backup, new-database restore and downtime upgrade rollback; docs/development.md for validation commands. Application: AGPL-3.0-only. Independent tracker: MIT. No paid feature gates.
