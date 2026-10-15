-- Additive metadata for the isolated test deployment only.
CREATE TABLE created_shared_ledgers (
  ledger_id TEXT PRIMARY KEY REFERENCES ledgers(id),
  owner_user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  operation_id TEXT NOT NULL, request_hash TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('personal','empty')),
  status TEXT NOT NULL CHECK(status IN ('copying','ready')),
  created_at INTEGER NOT NULL
);
