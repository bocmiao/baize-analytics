# API and event protocol

The runtime schemas in `packages/contracts` and actual server routes are authoritative. `PROJECT_SPEC.md` provides design intent; `IMPLEMENTATION_NOTES.md` records implementation corrections. Do not assume that a planned endpoint exists without a real route and test.

`GET /healthz` checks application and storage health. `POST /api/collect` accepts protocol-v1 envelopes. A 202 response indicates that accepted, privacy-processed events have been durably stored. Retries retain `event_id`; identical retries do not increase accepted counts, while reusing an ID with conflicting content is rejected. Browser clients contain the public site ID, never an administrative write secret. Page-instance IDs correlate SPA navigation, multiple tabs and heartbeats.

Management routes authenticate a login session or an API token restricted by scope and site; every site request checks authorization. Share links grant access to the shared result without management privileges. Use real endpoint tests to determine supported parameters and response behavior.
