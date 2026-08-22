-- Apply once to the remote D1 database before deploying the row-operation API.
-- This migration is additive: it does not rewrite or delete existing financial rows.
ALTER TABLE transactions ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE transactions ADD COLUMN last_operation_id TEXT;
ALTER TABLE transactions ADD COLUMN deleted_at INTEGER;

CREATE TABLE operation_results (
  operation_id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE sync_changes (
  cursor INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  change_type TEXT NOT NULL,
  revision INTEGER,
  payload_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_transactions_active_date ON transactions(deleted_at, date);
CREATE INDEX idx_sync_changes_cursor ON sync_changes(cursor);
