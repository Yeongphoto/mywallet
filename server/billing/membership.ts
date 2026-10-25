import { handleAuth } from '../auth/http.ts';
import type { AuthEnvironment } from '../auth/http.ts';
import { accountBenefit } from './account-benefits.ts';
import { accountPremium } from './store.ts';

export type MembershipEnvironment = AuthEnvironment & { BILLING_ENABLED?: string; ACCOUNT_MANAGEMENT_ENABLED?: string };
const reply = (data: unknown, status = 200) => Response.json(data, { status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

export async function effectiveAccountBenefit(env: MembershipEnvironment, userId: string) {
  const baseline = accountBenefit(userId);
  if (baseline === 'premium_admin') return baseline;
  if (env.ACCOUNT_MANAGEMENT_ENABLED !== 'true') return null;
  const row = await env.DB.prepare('SELECT active FROM account_premium_grants WHERE user_id=?').bind(userId).first<{ active: number }>();
  return row?.active === 1 ? 'premium_tester' as const : null;
}

// Read-only, current account only; no public grant/admin mutation endpoint.
export async function handleMembership(request: Request, env: MembershipEnvironment) {
  if (request.method !== 'GET') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405);
  if (new URL(request.url).search) return reply({ error: 'BAD_REQUEST' }, 400);
  try {
    const session = await handleAuth(new Request(new URL('/api/auth/session', request.url), { headers: request.headers }), env, 'session');
    if (!session.ok) return reply({ error: session.status === 401 ? 'UNAUTHENTICATED' : 'MEMBERSHIP_UNAVAILABLE' }, session.status);
    const userId = (await session.json() as { user: { id: string } }).user.id;
    const grant = await effectiveAccountBenefit(env, userId);
    if (grant) return reply({ plan: grant, premium: true, expiresAt: null });
    if (env.BILLING_ENABLED !== 'true') return reply({ plan: 'free', premium: false, expiresAt: null });
    const subscription = await accountPremium(env.DB, userId);
    return reply({ ...subscription, premium: subscription.plan === 'premium_yearly' });
  } catch { return reply({ error: 'MEMBERSHIP_UNAVAILABLE' }, 503); }
}
