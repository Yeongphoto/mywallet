-- A new, separate finance DB must be initialized explicitly before enabling web auth.
CREATE TABLE web_finance_environment (id TEXT PRIMARY KEY);
INSERT INTO web_finance_environment VALUES ('memoney-web-finance-v1');
CREATE TABLE web_personal_ready (ledger_id TEXT PRIMARY KEY);
CREATE TABLE shared_creation_jobs (
  ledger_id TEXT PRIMARY KEY, snapshot_json TEXT NOT NULL,
  next_row INTEGER NOT NULL DEFAULT 0, total_rows INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('copying','ready'))
);
