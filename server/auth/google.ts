import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export type GoogleIdentity = { issuer: string; subject: string; email: string | null; authoritativeEmail?: boolean };

export async function verifyGoogleIdentity(
  token: string, clientId: string, nonce: string, keys: JWTVerifyGetKey = googleKeys,
  authorizedParties: readonly string[] = [],
): Promise<GoogleIdentity> {
  if (!token || token.length > 16384 || !clientId || nonce.length < 32) throw new Error('INVALID_ID_TOKEN');
  const { payload } = await jwtVerify(token, keys, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: clientId, algorithms: ['RS256'],
    requiredClaims: ['iss', 'aud', 'sub', 'iat', 'exp', 'nonce'],
    maxTokenAge: '10m', clockTolerance: 30,
  });
  if (!payload.sub || payload.sub.length > 255 || payload.nonce !== nonce ||
      (payload.azp !== undefined && (typeof payload.azp !== 'string' ||
        ![clientId, ...authorizedParties].includes(payload.azp)))) throw new Error('INVALID_ID_TOKEN');
  // Email is contact metadata, never an ownership key or an account merge key.
  return { issuer: 'https://accounts.google.com', subject: payload.sub,
    authoritativeEmail: payload.email_verified === true && typeof payload.email === 'string' &&
      (payload.email.toLowerCase().endsWith('@gmail.com') || (typeof payload.hd === 'string' && payload.hd.length > 0)),
    email: payload.email_verified === true && typeof payload.email === 'string' ? payload.email : null };
}
