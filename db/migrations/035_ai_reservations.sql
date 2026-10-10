-- Durable quota accounting survives privacy erasure of model text/calls.
-- Expiry uses the full reserved upper bound conservatively; it is not provider billing.
CREATE TABLE ai_reservations (
 call_id uuid PRIMARY KEY,
 site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 month date NOT NULL,
 amount bigint NOT NULL CHECK(amount>0),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','settled','expired')),
 expires_at timestamptz NOT NULL,
 settled_tokens bigint CHECK(settled_tokens>=0),
 settled_at timestamptz,
 FOREIGN KEY(site_id,month) REFERENCES ai_budget(site_id,month),
 CHECK((status='active' AND settled_tokens IS NULL AND settled_at IS NULL) OR (status<>'active' AND settled_tokens IS NOT NULL AND settled_at IS NOT NULL))
);
CREATE INDEX ai_reservations_expiry ON ai_reservations(site_id,expires_at) WHERE status='active';
-- Old versions did not persist per-call reservation amounts. Preserve their aggregate
-- upper bound as an already-expired synthetic ledger entry; never invent actual usage.
INSERT INTO ai_reservations(call_id,site_id,month,amount,expires_at)
 SELECT gen_random_uuid(),site_id,month,reserved,now() FROM ai_budget WHERE reserved>0;
UPDATE ai_calls SET status='failed',answer='' WHERE status='reserved';
