-- Apply once, before enabling AUTH_PERSONAL_ONBOARDING on ALL app/web origins.
-- Historical accounts are deliberately ineligible, including logged-out users.
CREATE TABLE personal_onboarding_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  first_session_hash TEXT,
  first_login_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
INSERT INTO personal_onboarding_accounts(user_id,first_session_hash,first_login_at,expires_at)
  SELECT id,NULL,created_at,0 FROM users;
CREATE TABLE personal_ledgers (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  ledger_id TEXT NOT NULL UNIQUE REFERENCES ledgers(id),
  storage_kind TEXT NOT NULL CHECK(storage_kind IN ('legacy','scoped'))
);
