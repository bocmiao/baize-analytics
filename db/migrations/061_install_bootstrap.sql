CREATE TABLE install_bootstrap (
 id smallint PRIMARY KEY CHECK (id=1),
 state text NOT NULL CHECK(state IN ('pending','claimed','legacy','restored_blocked')),
 nonce_hash text,
 claimed_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 claimed_at timestamptz,
 CHECK((state='pending' AND nonce_hash IS NOT NULL AND nonce_hash ~ '^[a-f0-9]{64}$') OR (state<>'pending' AND nonce_hash IS NULL))
);
INSERT INTO install_bootstrap(id,state)
 SELECT 1,'legacy' WHERE EXISTS(SELECT 1 FROM users);
