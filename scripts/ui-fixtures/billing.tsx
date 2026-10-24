import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BillingSettings } from '../../src/auth/BillingSettings';
import type { BillingStatus, AnnualBillingClient } from '../../src/auth/billing-client';
import '../../src/styles.css';
import '../../src/memoney-family.css';

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get('theme') === 'dark' ? 'dark' : 'light';
document.documentElement.dataset.styleTheme = 'default';
let status: BillingStatus = { enabled: true, plan: query.get('plan') === 'premium' ? 'premium_yearly' : 'free',
  expiresAt: Date.now() + 365 * 86400000, accountId: 'a'.repeat(64), productId: 'memoney_premium', basePlanId: 'annual', billingPeriod: 'P1Y' };
const fixture: AnnualBillingClient = {
  async load() { return { available: true, status, price: { productId: 'memoney_premium', basePlanId: 'annual',
    billingPeriod: 'P1Y', formattedPrice: '₩2,000', currency: 'KRW', priceMicros: 2000000000 } }; },
  async purchase() { if (query.get('cancel') === '1') throw Error('CANCELLED'); status = { ...status, plan: 'premium_yearly' }; return status; },
  async restore() { return status; },
  async manage() { document.documentElement.dataset.managed = 'true'; },
};
createRoot(document.getElementById('root')!).render(<StrictMode><main style={{ maxWidth: 760, padding: 20, margin: 'auto' }}>
  <p style={{ color: 'var(--text-secondary)' }}>결제 모의 화면 · 실제 청구 없음 · 연 2,000원 등록 예정</p>
  <div className="settings-stack"><BillingSettings client={fixture} /></div>
</main></StrictMode>);
