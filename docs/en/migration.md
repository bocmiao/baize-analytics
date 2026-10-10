# Historical analytics migration

Import GA4 or other products' historical aggregates separately from local live events. Make imports idempotent by site, date and source version. Do not fabricate raw visitors or sessions, or use imported aggregates to compute cross-source unique visitors, funnels or retention. Label the historical source and coverage boundary in the dashboard. Connecting a real GA4 account requires administrative authorization; simulated integration checks do not validate a real account.

An automatic full-database Umami migration has not been verified. Use source exports and supported aggregate-import formats instead of importing an incompatible database schema directly. Back up the source system and verify record counts, time zones, currencies and metric definitions before migrating.
