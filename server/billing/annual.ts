import { hashToken } from '../auth/store.ts';

export const annualProduct = Object.freeze({ packageName: 'com.memoney.app', productId: 'memoney_premium',
  basePlanId: 'annual', billingPeriod: 'P1Y' });
export const subscriptionStates = ['SUBSCRIPTION_STATE_PENDING', 'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_PAUSED', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_ON_HOLD',
  'SUBSCRIPTION_STATE_CANCELED', 'SUBSCRIPTION_STATE_EXPIRED', 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED'] as const;
type SubscriptionState = typeof subscriptionStates[number];
export type VerifiedAnnualSubscription = Readonly<{
  userId: string; purchaseTokenHash: string; productId: string; basePlanId: string; state: SubscriptionState;
  expiresAt: number | null; autoRenewEnabled: boolean; acknowledged: boolean;
  verifiedAt: number; testPurchase: boolean;
}>;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const verifiedInProcess = new WeakSet<object>();
export function assertFreshlyVerifiedPurchase(purchase: VerifiedAnnualSubscription) {
  if (!verifiedInProcess.has(purchase)) throw Error('SERVER_VERIFICATION_REQUIRED');
}

// This identifier is supplied to Play Billing as obfuscatedAccountId. App login
// and the Play purchasing account can differ; never map purchases by email.
export async function billingAccountId(userId: string): Promise<string> {
  if (!uuid.test(userId)) throw Error('INVALID_BILLING_ACCOUNT');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('memoney:billing:' + userId));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

type GoogleSubscription = {
  subscriptionState?: string; acknowledgementState?: string; testPurchase?: unknown;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: Array<{ productId?: string; expiryTime?: string;
    offerDetails?: { basePlanId?: string }; autoRenewingPlan?: { autoRenewEnabled?: boolean } }>;
};

// Only call with a server-owned Android Publisher OAuth access token. There is
// no public grant endpoint and no client premium flag or local receipt fallback.
export async function verifyAnnualPurchase({ userId, purchaseToken, accessToken, allowTestPurchases = false,
  now = Date.now(), fetcher = fetch }: { userId: string; purchaseToken: string; accessToken: string;
    allowTestPurchases?: boolean; now?: number; fetcher?: typeof fetch }): Promise<VerifiedAnnualSubscription> {
  const account = await billingAccountId(userId);
  if (!purchaseToken || purchaseToken.length > 4096 || purchaseToken.trim() !== purchaseToken || !accessToken ||
      !Number.isSafeInteger(now) || now < 0) throw Error('INVALID_PURCHASE_VERIFICATION');
  let response: Response;
  try {
    response = await fetcher('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' +
      annualProduct.packageName + '/purchases/subscriptionsv2/tokens/' + encodeURIComponent(purchaseToken), {
      headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/json' },
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
  } catch { throw Error('PLAY_UNAVAILABLE'); }
  if (!response.ok) throw Error(response.status === 404 || response.status === 400 ? 'INVALID_PURCHASE' : 'PLAY_UNAVAILABLE');
  let data: GoogleSubscription;
  try { data = await response.json(); } catch { throw Error('INVALID_PLAY_RESPONSE'); }
  if (!data || data.externalAccountIdentifiers?.obfuscatedExternalAccountId !== account) throw Error('PURCHASE_ACCOUNT_MISMATCH');
  if (!subscriptionStates.includes(data.subscriptionState as SubscriptionState)) throw Error('INVALID_PLAY_RESPONSE');
  if (!['ACKNOWLEDGEMENT_STATE_PENDING', 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'].includes(data.acknowledgementState || '')) {
    throw Error('INVALID_PLAY_RESPONSE');
  }
  const testPurchase = data.testPurchase !== undefined;
  if (testPurchase && !allowTestPurchases) throw Error('TEST_PURCHASE_NOT_ALLOWED');
  const lines = Array.isArray(data.lineItems) ? data.lineItems.filter(line => line?.productId === annualProduct.productId &&
    line.offerDetails?.basePlanId === annualProduct.basePlanId) : [];
  if (!lines.length) throw Error('PURCHASE_PRODUCT_MISMATCH');
  const entitledState = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED']
    .includes(data.subscriptionState!);
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
  const expiry = lines.map(line => ({ line, expiresAt: typeof line.expiryTime === 'string' && timestamp.test(line.expiryTime)
    ? Date.parse(line.expiryTime) : NaN }))
    .filter(item => Number.isSafeInteger(item.expiresAt) && item.expiresAt >= 0).sort((a, b) => b.expiresAt - a.expiresAt)[0];
  if (entitledState && !expiry) throw Error('INVALID_PLAY_RESPONSE');
  const purchase = Object.freeze({ userId, purchaseTokenHash: await hashToken(purchaseToken),
    productId: annualProduct.productId, basePlanId: annualProduct.basePlanId,
    state: data.subscriptionState as SubscriptionState, expiresAt: expiry?.expiresAt ?? null,
    autoRenewEnabled: expiry?.line.autoRenewingPlan?.autoRenewEnabled === true,
    acknowledged: data.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    verifiedAt: now, testPurchase });
  verifiedInProcess.add(purchase);
  return purchase;
}

// Persist only snapshots returned by the verifier. RTDN must trigger a fresh
// Google API read; a notification's type alone cannot grant/revoke entitlement.
export function hasAnnualPremium(userId: string, purchases: readonly VerifiedAnnualSubscription[], now = Date.now()): boolean {
  return purchases.some(purchase => purchase.userId === userId && purchase.productId === annualProduct.productId &&
    purchase.basePlanId === annualProduct.basePlanId && purchase.verifiedAt <= now && purchase.expiresAt !== null &&
    purchase.expiresAt > now && ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED']
      .includes(purchase.state));
}
