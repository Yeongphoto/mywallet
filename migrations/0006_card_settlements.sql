-- Apply once to the remote D1 database after 0005.
-- Settlement links preserve every original card transaction and prevent a billing period from being paid twice.
ALTER TABLE transactions ADD COLUMN card_settlement_id TEXT;

CREATE TABLE card_settlements (
  id TEXT PRIMARY KEY,
  card_asset_id TEXT NOT NULL,
  payment_asset_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  due_date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  transaction_id TEXT NOT NULL UNIQUE,
  settled_at INTEGER NOT NULL,
  UNIQUE(card_asset_id, period_start, period_end)
);

CREATE INDEX idx_card_settlement_sources ON transactions(asset_id, card_settlement_id, date);
