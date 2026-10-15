-- Local/staging auth foundation only. Never applied to production automatically.
-- Ledger ownership and legacy data migration are separate decisions.
CREATE TABLE users (
  id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at INTEGER NOT NULL
);
CREATE TABLE auth_identities (
  issuer TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL, PRIMARY KEY (issuer, subject)
);
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX idx_auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE auth_login_challenges (
  token_hash TEXT PRIMARY KEY, nonce TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX idx_auth_login_challenges_expiry ON auth_login_challenges(expires_at);

-- Supports either a private ledger or explicitly invited shared membership.
-- These metadata tables do not attach any legacy financial rows.
CREATE TABLE ledgers (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE ledger_memberships (
  ledger_id TEXT NOT NULL REFERENCES ledgers(id), user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at INTEGER NOT NULL, PRIMARY KEY (ledger_id, user_id)
);
CREATE INDEX idx_ledger_memberships_user ON ledger_memberships(user_id, ledger_id);
