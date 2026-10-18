-- Apply only to an explicitly selected new auth/staging DB, not the legacy DB.
CREATE TABLE web_personal_ledgers (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  ledger_id TEXT NOT NULL UNIQUE REFERENCES ledgers(id)
);
