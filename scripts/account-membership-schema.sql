-- Authentication DB only. Preserve revoked grants on repeated application.
CREATE TABLE IF NOT EXISTS account_premium_grants (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  granted_by TEXT NOT NULL REFERENCES users(id),
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS account_premium_audit (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK(action IN ('grant','revoke')),
  created_at INTEGER NOT NULL
);
INSERT INTO account_premium_grants(user_id,active,granted_by,updated_at)
SELECT id,1,'18f5a8d3-2561-4083-bbac-2ffb67f15da6',CAST(strftime('%s','now') AS INTEGER)*1000
FROM users WHERE id='76ba00da-b386-4464-b857-c446d587ed6f' AND status='active'
AND NOT EXISTS(SELECT 1 FROM account_premium_grants WHERE user_id=users.id);
