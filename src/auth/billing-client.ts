export type BillingStatus = { enabled: boolean; plan?: 'free' | 'premium_yearly'; expiresAt?: number | null;
  accountId?: string; productId?: string; basePlanId?: string; billingPeriod?: string; purchasePending?: boolean };
export type AnnualPrice = { productId: string; basePlanId: string; billingPeriod: string; formattedPrice: string;
  currency: string; priceMicros: number };
type NativePurchases = { purchases: Array<{ purchaseToken: string; state: 'purchased' | 'pending' }> };
export type NativeBilling = {
  configuration(): Promise<{ available: boolean }>;
  product(): Promise<AnnualPrice>;
  purchase(options: { accountId: string }): Promise<NativePurchases>;
  restore(options: { accountId: string }): Promise<NativePurchases>;
  manage(): Promise<void>;
};
export type BillingView = { available: boolean; status?: BillingStatus; price?: AnnualPrice; priceError?: string };

export function createAnnualBillingClient(native: NativeBilling, request: typeof fetch) {
  let account: string | null = null, busy = false, loading: Promise<BillingView> | null = null;
  async function api(action: 'status' | 'verify', purchaseToken?: string): Promise<BillingStatus> {
    const response = await request('/api/billing/' + action, { method: purchaseToken === undefined ? 'GET' : 'POST',
      credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(60000),
      ...(purchaseToken === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purchaseToken }) }) });
    let data;
    try { data = await response.json(); } catch { throw Error('BILLING_UNAVAILABLE'); }
    if (!response.ok) throw Error(typeof data.error === 'string' ? data.error : 'BILLING_UNAVAILABLE');
    if (data.enabled === false) return { enabled: false };
    if (data.enabled !== true || !['free', 'premium_yearly'].includes(data.plan) || !/^[a-f0-9]{64}$/.test(data.accountId) ||
        data.productId !== 'memoney_premium' || data.basePlanId !== 'annual' || data.billingPeriod !== 'P1Y') throw Error('INVALID_BILLING_STATUS');
    return data;
  }
  async function current() {
    const status = await api('status');
    if (!status.enabled || !account) throw Error('BILLING_UNAVAILABLE');
    if (status.accountId !== account) throw Error('BILLING_ACCOUNT_CHANGED');
    return status;
  }
  async function verify(result: NativePurchases) {
    if (!Array.isArray(result.purchases)) throw Error('INVALID_PLAY_PURCHASES');
    let pending = false;
    for (const purchase of result.purchases) {
      if (!['pending', 'purchased'].includes(purchase.state) || !purchase.purchaseToken || purchase.purchaseToken.length > 4096) {
        throw Error('INVALID_PLAY_PURCHASES');
      }
      await current(); // Do not attach a purchase to a newly selected app account.
      try { const verified = await api('verify', purchase.purchaseToken); pending = pending || verified.purchasePending === true; }
      catch (error) {
        if ((error as Error).message !== 'PURCHASE_PROCESSING_PENDING') throw error;
        pending = true;
      }
    }
    return { ...(await current()), purchasePending: pending };
  }
  async function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (busy) throw Error('BILLING_BUSY'); busy = true;
    try { return await operation(); } finally { busy = false; }
  }
  return {
    load(): Promise<BillingView> {
      if (loading) return loading;
      loading = exclusive(async () => {
        if (!(await native.configuration()).available) return { available: false };
        const status = await api('status');
        if (!status.enabled) return { available: false };
        account = status.accountId!;
        if (status.plan === 'premium_yearly') return { available: true, status };
        try {
          const price = await native.product();
          if (price.productId !== status.productId || price.basePlanId !== status.basePlanId || price.billingPeriod !== 'P1Y' ||
              !price.formattedPrice || !/^[A-Z]{3}$/.test(price.currency) || !Number.isSafeInteger(price.priceMicros) || price.priceMicros <= 0) {
            throw Error('INVALID_PLAY_PRICE');
          }
          return { available: true, status, price };
        } catch (error) {
          return { available: true, status, priceError: (error as { code?: string }).code || (error as Error).message || 'PRODUCT_UNAVAILABLE' };
        }
      }).finally(() => { loading = null; });
      return loading;
    },
    purchase: () => exclusive(async () => {
      const status = await current();
      if (status.plan === 'premium_yearly') return status;
      const purchases = await native.purchase({ accountId: account! });
      if (!purchases.purchases?.length) throw Error('PURCHASE_NOT_RETURNED');
      return verify(purchases);
    }),
    restore: () => exclusive(async () => { await current(); return verify(await native.restore({ accountId: account! })); }),
    manage: () => exclusive(async () => { await current(); await native.manage(); }),
  };
}
export type AnnualBillingClient = ReturnType<typeof createAnnualBillingClient>;
