import { handleAuth } from '../auth/http.ts';
import type { AuthEnvironment } from '../auth/http.ts';
import { annualProduct, billingAccountId, hasAnnualPremium, verifyAnnualPurchase } from './annual.ts';
import { accountPremium, saveVerifiedSubscription } from './store.ts';
import { acknowledgeAnnualPurchase, playAccessToken, playCredentialsConfigured } from './google-play.ts';
import type { PlayCredentials } from './google-play.ts';

export interface BillingEnvironment extends AuthEnvironment, PlayCredentials {
  BILLING_ENABLED?: string;
  BILLING_ALLOW_TEST_PURCHASES?: string;
}
type Dependencies = { fetcher?: typeof fetch; accessToken?: () => Promise<string>; now?: () => number };
const reply = (data: unknown, status = 200) => Response.json(data, { status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

async function tokenBody(request: Request): Promise<string> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json') || !request.body) throw Error('BAD_REQUEST');
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 8192) { await reader.cancel(); throw Error('BAD_REQUEST'); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw Error('BAD_REQUEST'); }
  if (!body || Object.keys(body).length !== 1 || typeof body.purchaseToken !== 'string' ||
      !body.purchaseToken || body.purchaseToken.length > 4096 || body.purchaseToken.trim() !== body.purchaseToken) throw Error('BAD_REQUEST');
  return body.purchaseToken;
}

export async function handleBilling(request: Request, env: BillingEnvironment, action: string, dependencies: Dependencies = {}) {
  const method = action === 'status' ? 'GET' : action === 'verify' ? 'POST' : null;
  if (!method) return reply({ error: 'NOT_FOUND' }, 404);
  if (request.method !== method) return reply({ error: 'METHOD_NOT_ALLOWED' }, 405);
  if (new URL(request.url).search) return reply({ error: 'BAD_REQUEST' }, 400);
  if (env.BILLING_ENABLED !== 'true') return action === 'status' ? reply({ enabled: false }) : reply({ error: 'BILLING_NOT_ENABLED' }, 503);
  if (!playCredentialsConfigured(env)) return reply({ error: 'BILLING_NOT_CONFIGURED' }, 503);
  if (method === 'POST' && request.headers.get('Origin') !== env.AUTH_ORIGIN) return reply({ error: 'ORIGIN_REJECTED' }, 403);
  try {
    const session = await handleAuth(new Request(new URL('/api/auth/session', request.url), { headers: request.headers }), env, 'session');
    if (!session.ok) return reply({ error: session.status === 401 ? 'UNAUTHENTICATED' : 'BILLING_UNAVAILABLE' }, session.status);
    const userId = (await session.json() as { user: { id: string } }).user.id;
    const now = dependencies.now?.() ?? Date.now();
    const status = async () => ({ enabled: true, ...(await accountPremium(env.DB, userId, now)),
      accountId: await billingAccountId(userId), productId: annualProduct.productId,
      basePlanId: annualProduct.basePlanId, billingPeriod: annualProduct.billingPeriod });
    if (action === 'status') return reply(await status());
    const purchaseToken = await tokenBody(request);
    // Verification throttling is separate from financial entry allowances.
    const window = Math.floor(now / 3600000) * 3600000;
    const permit = await env.DB.prepare(`INSERT INTO billing_verification_windows(user_id,window_start,attempts) VALUES(?,?,1)
      ON CONFLICT(user_id) DO UPDATE SET window_start=excluded.window_start,
      attempts=CASE WHEN billing_verification_windows.window_start=excluded.window_start THEN billing_verification_windows.attempts+1 ELSE 1 END
      WHERE billing_verification_windows.window_start<>excluded.window_start OR billing_verification_windows.attempts<30
      RETURNING attempts`).bind(userId, window).first();
    if (!permit) return reply({ error: 'VERIFICATION_RATE_LIMITED' }, 429);
    const fetcher = dependencies.fetcher ?? fetch;
    const accessToken = dependencies.accessToken ? await dependencies.accessToken() : await playAccessToken(env, fetcher, now);
    const purchase = await verifyAnnualPurchase({ userId, purchaseToken, accessToken,
      allowTestPurchases: env.BILLING_ALLOW_TEST_PURCHASES === 'true', fetcher, now });
    await saveVerifiedSubscription(env.DB, purchase);
    // Grant the verified entitlement first. Failed acknowledgement remains
    // retryable and must not turn a real purchase into a false free account.
    if (!purchase.acknowledged && hasAnnualPremium(userId, [purchase], now)) {
      await acknowledgeAnnualPurchase(purchaseToken, accessToken, fetcher);
    }
    return reply({ ...(await status()), purchasePending: purchase.state === 'SUBSCRIPTION_STATE_PENDING' });
  } catch (error) {
    const code = (error as Error).message;
    const statuses: Record<string, number> = { BAD_REQUEST: 400, INVALID_PURCHASE: 400, PURCHASE_PRODUCT_MISMATCH: 400,
      PURCHASE_ACCOUNT_MISMATCH: 409, PURCHASE_ALREADY_LINKED: 409, TEST_PURCHASE_NOT_ALLOWED: 403,
      PLAY_UNAVAILABLE: 503, PURCHASE_PROCESSING_PENDING: 503, BILLING_NOT_CONFIGURED: 503 };
    return reply({ error: statuses[code] ? code : 'BILLING_UNAVAILABLE' }, statuses[code] ?? 503);
  }
}
