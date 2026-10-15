-- Development-only empty schema, inspected from the verified 2026-10-07 backup.
-- No user rows, DROP statements, production bindings, or ownership migration.
CREATE TABLE assets (
  id TEXT PRIMARY KEY, category TEXT NOT NULL, amount INTEGER NOT NULL, memo TEXT NOT NULL,
  name TEXT, kind TEXT, revision INTEGER NOT NULL DEFAULT 1, sort_order INTEGER,
  card_cycle_start_day INTEGER, card_payment_day INTEGER, card_cycle_end_day INTEGER,
  card_payment_asset_id TEXT
);
CREATE TABLE card_settlements (
  id TEXT PRIMARY KEY, card_asset_id TEXT NOT NULL, payment_asset_id TEXT NOT NULL,
  period_start TEXT NOT NULL, period_end TEXT NOT NULL, due_date TEXT NOT NULL,
  amount INTEGER NOT NULL, transaction_id TEXT NOT NULL UNIQUE, settled_at INTEGER NOT NULL
);
CREATE TABLE custom_categories (
  id TEXT NOT NULL, type TEXT NOT NULL, label TEXT NOT NULL, color TEXT, kind TEXT,
  PRIMARY KEY (id, type)
);
CREATE TABLE deleted_recurring_txs (id TEXT PRIMARY KEY);
CREATE TABLE operation_results (
  operation_id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  status TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL,
  request_hash TEXT NOT NULL DEFAULT ''
);
CREATE TABLE plans (
  category TEXT NOT NULL, type TEXT NOT NULL, plannedAmount INTEGER NOT NULL,
  PRIMARY KEY (category, type)
);
CREATE TABLE recurring_rules (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, day INTEGER NOT NULL, amount INTEGER NOT NULL,
  title TEXT NOT NULL, category TEXT NOT NULL, startMonth TEXT NOT NULL, endMonth TEXT,
  asset_id TEXT, to_asset_id TEXT, transaction_time TEXT
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE sync_changes (
  cursor INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL, change_type TEXT NOT NULL, revision INTEGER,
  payload_json TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE sync_groups (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE transactions (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, date TEXT NOT NULL, amount INTEGER NOT NULL,
  title TEXT NOT NULL, category TEXT NOT NULL, recurring_rule_id TEXT, asset_id TEXT,
  to_asset_id TEXT, created_at INTEGER, transaction_time TEXT, installment_group_id TEXT,
  installment_index INTEGER, installment_months INTEGER, revision INTEGER NOT NULL DEFAULT 1,
  last_operation_id TEXT, deleted_at INTEGER, card_settlement_id TEXT
);
CREATE INDEX idx_card_settlement_sources ON transactions(asset_id, card_settlement_id, date);
CREATE INDEX idx_card_settlements_period ON card_settlements(card_asset_id, period_start, period_end);
CREATE INDEX idx_sync_changes_cursor ON sync_changes(cursor);
CREATE INDEX idx_transactions_active_date ON transactions(deleted_at, date);
