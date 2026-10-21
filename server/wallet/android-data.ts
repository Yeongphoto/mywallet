import type { SharedWalletEnvironment } from './shared-web.ts';

// Compatibility is opt-in and reuses Android membership/ledger IDs. It never
// provisions a new personal ledger or copies any financial rows on login.
export function androidDataConnection(env: SharedWalletEnvironment) {
  if (env.AUTH_ANDROID_DATA_COMPAT !== 'true' || env.AUTH_WEB_WALLETS === 'true' || env.WEB_FINANCE ||
      env.AUTH_ENABLED !== 'true' || env.AUTH_TEST_PERSONAL_LEDGER !== 'true' || env.AUTH_TEST_MULTI_LEDGER !== 'true' ||
      !env.TEST_FINANCE || !env.TEST_SHARED_FINANCE || env.AUTH_SHARED_WALLET_ORIGIN) return false;
  try {
    const origin = new URL(env.AUTH_ORIGIN || '');
    return origin.origin === env.AUTH_ORIGIN && (
      origin.protocol === 'https:' && (origin.hostname === 'mywallet-8mx.pages.dev' || origin.hostname.endsWith('.mywallet-8mx.pages.dev')) ||
      env.AUTH_LOCAL_DEV === 'true' && ['http://localhost:5187', 'http://localhost:5189'].includes(origin.origin));
  } catch { return false; }
}
