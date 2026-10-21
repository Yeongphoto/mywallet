import { verifyGoogleIdentity } from './google.ts';
import type { GoogleIdentity } from './google.ts';
import { createChallenge, readChallenge, consumeChallenge, resolveUser, createSession, sessionUser, revokeSession } from './store.ts';
import type { AuthDatabase } from './store.ts';
import { browserLogin } from './browser-login.ts';

export interface AuthEnvironment {
  DB: AuthDatabase;
  AUTH_ENABLED?: string;
  AUTH_GOOGLE_CLIENT_ID?: string;
  AUTH_GOOGLE_ANDROID_CLIENT_ID?: string;
  AUTH_ORIGIN?: string;
  AUTH_LOCAL_DEV?: string;
  AUTH_LEDGER_INVITES?: string;
  AUTH_BROWSER_LOGIN?: string;
  AUTH_PERSONAL_ONBOARDING?: string;
}
function settings(env: AuthEnvironment, request: Request) {
  if (env.AUTH_ENABLED !== 'true' || !env.AUTH_GOOGLE_CLIENT_ID?.endsWith('.apps.googleusercontent.com') || !env.AUTH_ORIGIN) return null;
  if (env.AUTH_GOOGLE_ANDROID_CLIENT_ID !== undefined &&
      !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(env.AUTH_GOOGLE_ANDROID_CLIENT_ID)) return null;
  try {
    const origin = new URL(env.AUTH_ORIGIN);
    const local = env.AUTH_LOCAL_DEV === 'true' && origin.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
    if (origin.origin !== env.AUTH_ORIGIN || new URL(request.url).origin !== origin.origin ||
      (origin.protocol !== 'https:' && !local)) return null;
    return { clientId: env.AUTH_GOOGLE_CLIENT_ID, origin: origin.origin, local, personalOnboarding: env.AUTH_PERSONAL_ONBOARDING === 'true',
      authorizedParties: env.AUTH_GOOGLE_ANDROID_CLIENT_ID ? [env.AUTH_GOOGLE_ANDROID_CLIENT_ID] : [],
      sessionCookie: local ? 'mywallet-dev-session' : '__Host-mywallet-session',
      challengeCookie: local ? 'mywallet-dev-login-state' : '__Host-mywallet-login-state' };
  } catch { return null; }
}
function response(data: unknown, status = 200, cookies: string[] = []) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  cookies.forEach(cookie => headers.append('Set-Cookie', cookie));
  return new Response(JSON.stringify(data), { status, headers });
}
function cookie(name: string, token: string, maxAge: number, local: boolean) {
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${local ? '' : '; Secure'}`;
}
function cookieValue(request: Request, name: string) {
  const matches = (request.headers.get('Cookie') || '').split(';').map(part => part.trim())
    .filter(part => part.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : '';
}
type IdentityVerifier = (token: string, clientId: string, nonce: string, authorizedParties: readonly string[]) => Promise<GoogleIdentity>;
const verifyIdentity: IdentityVerifier = (token, clientId, nonce, parties) =>
  verifyGoogleIdentity(token, clientId, nonce, undefined, parties);

async function boundedJsonText(request: Request) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return text + decoder.decode();
      bytes += chunk.value.byteLength;
      if (bytes > 20000) { await reader.cancel(); return null; }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally { reader.releaseLock(); }
}

export async function handleAuth(request: Request, env: AuthEnvironment, action: string, verify: IdentityVerifier = verifyIdentity) {
  const config = settings(env, request);
  if (action === 'config' && request.method === 'GET') {
    return response({ enabled: Boolean(config), clientId: config?.clientId ?? null, ...(config&&env.AUTH_BROWSER_LOGIN==='true'?{browserLogin:true}:{}), ...(config?.personalOnboarding?{personalOnboarding:true}:{}) });
  }
  if (!config) return response({ error: 'AUTH_NOT_CONFIGURED' }, 503);
  const methods: Record<string, string> = { challenge: 'POST', google: 'POST', session: 'GET', logout: 'POST',...Object.fromEntries(env.AUTH_BROWSER_LOGIN==='true'?['browser-start','browser-preview','browser-approve','browser-poll','browser-claim'].map(action=>[action,'POST']):[]) };
  if (!methods[action]) return response({ error: 'NOT_FOUND' }, 404);
  if (request.method !== methods[action]) return response({ error: 'METHOD_NOT_ALLOWED' }, 405);
  if (request.method === 'POST' && request.headers.get('Origin') !== config.origin) {
    return response({ error: 'ORIGIN_REJECTED' }, 403);
  }
  try {
    if(action.startsWith('browser-'))return browserLogin(request,env.DB,config,action,verify);
    if (action === 'challenge') {
      const challenge = await createChallenge(env.DB);
      return response({ nonce: challenge.nonce, clientId: config.clientId }, 200,
        [cookie(config.challengeCookie, challenge.token, 300, config.local)]);
    }
    if (action === 'google') {
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return response({ error: 'BAD_REQUEST' }, 400);
      const text = await boundedJsonText(request);
      if (text === null) return response({ error: 'BAD_REQUEST' }, 400);
      let token: unknown;
      try { token = JSON.parse(text).idToken; } catch { return response({ error: 'BAD_REQUEST' }, 400); }
      if (typeof token !== 'string' || token.length > 16384) return response({ error: 'BAD_REQUEST' }, 400);
      const stateToken = cookieValue(request, config.challengeCookie);
      const challenge = await readChallenge(env.DB, stateToken);
      if (!challenge) return response({ error: 'LOGIN_CHALLENGE_EXPIRED' }, 401);
      let identity: GoogleIdentity;
      try { identity = await verify(token, config.clientId, challenge.nonce, config.authorizedParties); }
      catch { return response({ error: 'INVALID_ID_TOKEN' }, 401); }
      if (!await consumeChallenge(env.DB, stateToken, challenge.nonce)) return response({ error: 'LOGIN_CHALLENGE_EXPIRED' }, 401);
      const userId = await resolveUser(env.DB, identity);
      if (env.AUTH_LEDGER_INVITES === 'true') {
        await env.DB.prepare('INSERT INTO auth_identity_profiles (user_id, email, authoritative, verified_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email, authoritative=excluded.authoritative, verified_at=excluded.verified_at')
          .bind(userId, identity.email?.trim().toLowerCase() || null, identity.authoritativeEmail === true ? 1 : 0, Date.now()).run();
      }
      const oldSession = cookieValue(request, config.sessionCookie);
      await revokeSession(env.DB, oldSession);
      const session = await createSession(env.DB, userId, Date.now(), config.personalOnboarding);
      return response({ user: { id: userId } }, 200, [
        cookie(config.sessionCookie, session.token, session.maxAge, config.local),
        cookie(config.challengeCookie, '', 0, config.local),
      ]);
    }
    const token = cookieValue(request, config.sessionCookie);
    if (action === 'logout') {
      await revokeSession(env.DB, token);
      return response({ success: true }, 200, [cookie(config.sessionCookie, '', 0, config.local), cookie(config.challengeCookie, '', 0, config.local)]);
    }
    const user = await sessionUser(env.DB, token);
    return user ? response({ user }) : response({ error: 'UNAUTHENTICATED' }, 401);
  } catch {
    // Do not return SQL errors, raw ID tokens, emails, or provider responses.
    return response({ error: 'AUTH_UNAVAILABLE' }, 503);
  }
}
