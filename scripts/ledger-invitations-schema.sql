-- Additive metadata only. This does not attach or modify financial rows.
CREATE TABLE IF NOT EXISTS auth_identity_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id), email TEXT,
  authoritative INTEGER NOT NULL DEFAULT 0, verified_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger_invitations (
  id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL REFERENCES ledgers(id),
  created_by TEXT NOT NULL REFERENCES users(id), target_email TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('editor','viewer')), token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  revoked_at INTEGER, accepted_by TEXT REFERENCES users(id), accepted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ledger_invitations_ledger ON ledger_invitations(ledger_id, created_at);
