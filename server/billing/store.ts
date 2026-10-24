import type { AuthDatabase } from '../auth/store.ts';
import { annualProduct, assertFreshlyVerifiedPurchase } from './annual.ts';
import type { VerifiedAnnualSubscription } from './annual.ts';

// Authentication DB only. Financial resets, restores and ledger generations must
// never copy, delete or re-create this account-level purchase registry.
export async function saveVerifiedSubscription(db: AuthDatabase, purchase: VerifiedAnnualSubscription) {
  assertFreshlyVerifiedPurchase(purchase);
  const row = await db.prepare(`INSERT INTO billing_subscriptions
    (purchase_token_hash,user_id,product_id,base_plan_id,state,expires_at,auto_renew,acknowledged,verified_at,test_purchase)
    VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(purchase_token_hash) DO UPDATE SET
    state=excluded.state,expires_at=excluded.expires_at,auto_renew=excluded.auto_renew,
    acknowledged=excluded.acknowledged,verified_at=excluded.verified_at,test_purchase=excluded.test_purchase
    WHERE billing_subscriptions.user_id=excluded.user_id AND billing_subscriptions.verified_at<=excluded.verified_at
    RETURNING purchase_token_hash`).bind(purchase.purchaseTokenHash, purchase.userId, purchase.productId, purchase.basePlanId,
      purchase.state, purchase.expiresAt, Number(purchase.autoRenewEnabled), Number(purchase.acknowledged),
      purchase.verifiedAt, Number(purchase.testPurchase)).first();
  if (row) return 'stored' as const;
  const previous = await db.prepare('SELECT user_id FROM billing_subscriptions WHERE purchase_token_hash=?')
    .bind(purchase.purchaseTokenHash).first<{ user_id: string }>();
  if (previous?.user_id !== purchase.userId) throw Error('PURCHASE_ALREADY_LINKED');
  return 'stale' as const;
}

export async function accountPremium(db: AuthDatabase, userId: string, now = Date.now()) {
  const row = await db.prepare(`SELECT MAX(expires_at) AS expires_at FROM billing_subscriptions
    WHERE user_id=? AND product_id=? AND base_plan_id=? AND verified_at<=? AND expires_at>?
    AND state IN('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED')`)
    .bind(userId, annualProduct.productId, annualProduct.basePlanId, now, now).first<{ expires_at: number | null }>();
  const expiresAt = row?.expires_at ?? null;
  if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt <= now)) throw Error('INVALID_STORED_SUBSCRIPTION');
  return { plan: expiresAt === null ? 'free' as const : 'premium_yearly' as const, expiresAt };
}
