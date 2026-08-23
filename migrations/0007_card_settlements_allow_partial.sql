-- Apply once after 0006. A billing period can be paid early more than once;
-- duplicate prevention remains on the original transaction links, not the period.
CREATE TABLE card_settlements_next (
  id TEXT PRIMARY KEY,
  card_asset_id TEXT NOT NULL,
  payment_asset_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  due_date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  transaction_id TEXT NOT NULL UNIQUE,
  settled_at INTEGER NOT NULL
);

INSERT INTO card_settlements_next (id, card_asset_id, payment_asset_id, period_start, period_end, due_date, amount, transaction_id, settled_at)
SELECT id, card_asset_id, payment_asset_id, period_start, period_end, due_date, amount, transaction_id, settled_at FROM card_settlements;

DROP TABLE card_settlements;
ALTER TABLE card_settlements_next RENAME TO card_settlements;
CREATE INDEX idx_card_settlements_period ON card_settlements(card_asset_id, period_start, period_end);
