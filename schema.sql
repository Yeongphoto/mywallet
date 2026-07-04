DROP TABLE IF EXISTS transactions;
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL
);

DROP TABLE IF EXISTS assets;
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  amount INTEGER NOT NULL,
  memo TEXT NOT NULL
);

DROP TABLE IF EXISTS plans;
CREATE TABLE plans (
  category TEXT NOT NULL,
  type TEXT NOT NULL,
  plannedAmount INTEGER NOT NULL,
  PRIMARY KEY (category, type)
);

DROP TABLE IF EXISTS custom_categories;
CREATE TABLE custom_categories (
  id TEXT NOT NULL,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  PRIMARY KEY (id, type)
);

DROP TABLE IF EXISTS settings;
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

DROP TABLE IF EXISTS recurring_rules;
CREATE TABLE recurring_rules (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  day INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  startMonth TEXT NOT NULL,
  endMonth TEXT
);

DROP TABLE IF EXISTS deleted_recurring_txs;
CREATE TABLE deleted_recurring_txs (
  id TEXT PRIMARY KEY
);
