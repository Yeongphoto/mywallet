import { AuthError, createAuthClient } from './auth-client';

export type GoogleWebIdentity = {
  initialize(options: { client_id: string; nonce: string; auto_select: boolean; ux_mode: string; callback(response: { credential: string }): void }): void;
  renderButton(element: HTMLElement, options: Record<string, string | number>): void;
  disableAutoSelect(): void;
};
declare global { interface Window { google?: { accounts: { id: GoogleWebIdentity } }; } }
let loading: Promise<GoogleWebIdentity> | null = null;
export function loadGoogleIdentity(): Promise<GoogleWebIdentity> {
  if (window.google?.accounts.id) return Promise.resolve(window.google.accounts.id);
  if (loading) return loading;
  loading = new Promise<GoogleWebIdentity>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    const timeout = window.setTimeout(() => fail(), 15000);
    function fail() { window.clearTimeout(timeout); script.remove(); reject(new AuthError('GOOGLE_UNAVAILABLE')); }
    script.onerror = fail;
    script.onload = () => {
      window.clearTimeout(timeout);
      if (window.google?.accounts.id) resolve(window.google.accounts.id); else fail();
    };
    document.head.appendChild(script);
  }).catch(error => { loading = null; throw error; });
  return loading;
}
export const webAuth = createAuthClient({
  async signIn() { throw new AuthError('USE_GOOGLE_BUTTON'); },
  async clearCredentialState() { window.google?.accounts.id.disableAutoSelect(); },
});
