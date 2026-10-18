CREATE TABLE memoney_shared_test_database(id TEXT PRIMARY KEY);
INSERT INTO memoney_shared_test_database VALUES('memoney-android-test-shared');
CREATE TABLE shared_creation_jobs (
  ledger_id TEXT PRIMARY KEY, snapshot_json TEXT NOT NULL,
  next_row INTEGER NOT NULL DEFAULT 0, total_rows INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('copying','ready'))
);
