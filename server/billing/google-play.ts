import { importPKCS8, SignJWT } from 'jose';
import { annualProduct } from './annual.ts';

export type PlayCredentials = { BILLING_SERVICE_ACCOUNT_EMAIL?: string; BILLING_SERVICE_ACCOUNT_PRIVATE_KEY?: string };
export function playCredentialsConfigured(env: PlayCredentials) {
  return /^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(env.BILLING_SERVICE_ACCOUNT_EMAIL || '') &&
    env.BILLING_SERVICE_ACCOUNT_PRIVATE_KEY?.startsWith('-----BEGIN PRIVATE KEY-----') === true;
}

export async function playAccessToken(env: PlayCredentials, fetcher: typeof fetch = fetch, now = Date.now()): Promise<string> {
  if (!playCredentialsConfigured(env)) throw Error('BILLING_NOT_CONFIGURED');
  try {
    const key = await importPKCS8(env.BILLING_SERVICE_ACCOUNT_PRIVATE_KEY!, 'RS256');
    const seconds = Math.floor(now / 1000);
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/androidpublisher' })
      .setProtectedHeader({ alg: 'RS256' }).setIssuer(env.BILLING_SERVICE_ACCOUNT_EMAIL!)
      .setAudience('https://oauth2.googleapis.com/token').setIssuedAt(seconds).setExpirationTime(seconds + 3600).sign(key);
    const response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('OAuth unavailable');
    const body = await response.json() as { access_token?: string; token_type?: string; expires_in?: number };
    if (!body.access_token || body.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(body.expires_in) || body.expires_in! <= 0) {
      throw Error('Invalid OAuth response');
    }
    return body.access_token;
  } catch { throw Error('PLAY_UNAVAILABLE'); }
}

export async function acknowledgeAnnualPurchase(purchaseToken: string, accessToken: string, fetcher: typeof fetch = fetch) {
  try {
    const response = await fetcher('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' +
      annualProduct.packageName + '/purchases/subscriptions/' + annualProduct.productId + '/tokens/' +
      encodeURIComponent(purchaseToken) + ':acknowledge', { method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, body: '{}',
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('Acknowledge unavailable');
  } catch { throw Error('PURCHASE_PROCESSING_PENDING'); }
}
