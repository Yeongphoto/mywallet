export type User = { id: string };
export type NativeGoogle = {
  signIn(options: { clientId: string; nonce: string }): Promise<{ idToken: string }>;
  clearCredentialState(): Promise<void>;
};
export class AuthError extends Error {
  code: string;
  constructor(code: string) { super(code); this.code = code; }
}

export function createAuthClient(native: NativeGoogle, request: typeof fetch = fetch) {
  async function api(action: string, method = 'GET', body?: unknown) {
    let response: Response;
    try {
      response = await request(`/api/auth/${action}`, {
        method, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch { throw new AuthError('NETWORK'); }
    let data;
    try { data = await response.json(); } catch { throw new AuthError('AUTH_UNAVAILABLE'); }
    if (!response.ok) throw new AuthError(typeof data.error === 'string' ? data.error : 'AUTH_UNAVAILABLE');
    return data;
  }
  function user(data: unknown): User {
    const id = (data as { user?: User } | null)?.user?.id;
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) throw new AuthError('AUTH_UNAVAILABLE');
    return { id };
  }
  async function session(): Promise<User | null> {
    try { return user(await api('session')); }
    catch (error) {
      if (error instanceof AuthError && error.code === 'UNAUTHENTICATED') return null;
      throw error;
    }
  }
  async function prepareSignIn() {
    const challenge = await api('challenge', 'POST');
    if (typeof challenge.nonce !== 'string' || !/^[a-f0-9]{64}$/.test(challenge.nonce)
      || typeof challenge.clientId !== 'string' || !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(challenge.clientId)) throw new AuthError('AUTH_UNAVAILABLE');
    return { clientId: challenge.clientId as string, nonce: challenge.nonce as string };
  }
  async function finishSignIn(credential: { idToken: string }): Promise<User> {
    try {
      if (typeof credential.idToken !== 'string' || !credential.idToken || credential.idToken.length > 16384) throw new AuthError('INVALID_ID_TOKEN');
      await api('google', 'POST', { idToken: credential.idToken });
    } finally { credential.idToken = ''; }
    const authenticated = await session();
    if (!authenticated) throw new AuthError('SESSION_NOT_SAVED');
    return authenticated;
  }
  return {
    prepareSignIn,
    finishSignIn,
    async configuration(): Promise<{ enabled: boolean; clientId: string | null }> {
      const data = await api('config');
      if (data.enabled !== true) return { enabled: false, clientId: null };
      if (typeof data.clientId !== 'string' || !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(data.clientId)) {
        throw new AuthError('AUTH_UNAVAILABLE');
      }
      return { enabled: true, clientId: data.clientId };
    },
    session,
    async signIn(): Promise<User> {
      // Every attempt gets a fresh nonce. The challenge cookie stays in the WebView.
      const challenge = await prepareSignIn();
      if (typeof challenge.nonce !== 'string' || !/^[a-f0-9]{64}$/.test(challenge.nonce)
        || typeof challenge.clientId !== 'string' || !challenge.clientId.endsWith('.apps.googleusercontent.com')) {
        throw new AuthError('AUTH_UNAVAILABLE');
      }
      const credential = await native.signIn({ clientId: challenge.clientId, nonce: challenge.nonce });
      try {
        if (typeof credential.idToken !== 'string' || credential.idToken.length > 16384) throw new AuthError('INVALID_ID_TOKEN');
        await api('google', 'POST', { idToken: credential.idToken });
      } finally { credential.idToken = ''; }
      // Do not display success until the HttpOnly session cookie is accepted by the server.
      const authenticated = await session();
      if (!authenticated) throw new AuthError('SESSION_NOT_SAVED');
      return authenticated;
    },
    async logout(): Promise<{ providerCleared: boolean }> {
      await api('logout', 'POST');
      try { await native.clearCredentialState(); return { providerCleared: true }; }
      catch { return { providerCleared: false }; }
    },
  };
}
