-- Additive authentication-DB migration. Do not apply during normal app startup.
-- This table is deliberately outside all financial snapshot/reset/restore data.
CREATE TABLE IF NOT EXISTS billing_subscriptions (
  purchase_token_hash TEXT PRIMARY KEY CHECK(length(purchase_token_hash)=64),
  user_id TEXT NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL,
  base_plan_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN(
    'SUBSCRIPTION_STATE_PENDING','SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_PAUSED',
    'SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_ON_HOLD',
    'SUBSCRIPTION_STATE_CANCELED','SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED')),
  expires_at INTEGER,
  auto_renew INTEGER NOT NULL CHECK(auto_renew IN(0,1)),
  acknowledged INTEGER NOT NULL CHECK(acknowledged IN(0,1)),
  verified_at INTEGER NOT NULL CHECK(verified_at>=0),
  test_purchase INTEGER NOT NULL CHECK(test_purchase IN(0,1))
);
CREATE INDEX IF NOT EXISTS billing_subscriptions_user ON billing_subscriptions(user_id,expires_at);
