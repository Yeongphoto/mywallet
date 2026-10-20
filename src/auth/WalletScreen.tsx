import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { registerPlugin } from '@capacitor/core';
import { preloadD1Cache } from '../d1-cache-preload';
import { createAuthClient } from './auth-client';
import type { NativeGoogle } from './auth-client';
import { activateWalletScope, isWalletAccessDenied, lockWalletScope, readWalletContext, walletContext } from './wallet-scope';
import './signin.css';
import { useAppAppearance } from './use-app-appearance';
import { WalletConnectionScreen } from './WalletConnectionScreen';
import { useLaunchReady } from './use-launch-ready';

const auth = createAuthClient(registerPlugin<NativeGoogle>('MemoneyGoogleAuth'));
export default function WalletScreen() {
  useAppAppearance();
  const [App, setApp] = useState<ComponentType<{ onReady?: () => void }> | null>(null);
  const [stage, setStage] = useState<'sleep' | 'complete' | 'ready'>('sleep');
  const appReady = useCallback(() => setStage('complete'), []);
  const enterApp = useCallback(() => setStage('ready'), []);
  const [error, setError] = useState('');
  useLaunchReady(!!error);
  const [loggingOut, setLoggingOut] = useState(false);
  const [signInRequired, setSignInRequired] = useState(false);
  const retry = useRef<() => void>(() => {});
  useEffect(() => {
    // Let App finish its modal/history cleanup before navigating.
    if (signInRequired) window.location.replace('/signin');
  }, [signInRequired]);
  useEffect(() => {
    let disposed = false;
    let opened = false;
    let inFlight = false;
    let closing = false;
    let logoutInFlight = false;
    let redirecting = false;
    let failures = 0;
    let retryTimer = 0;
    const clearRetry = () => { window.clearTimeout(retryTimer); retryTimer = 0; };
    async function connect() {
      if (disposed || closing || redirecting || inFlight || document.visibilityState !== 'visible') return;
      clearRetry(); inFlight = true;
      try {
        const scope = await readWalletContext();
        if (disposed || closing || redirecting) return;
        if (opened) {
          const current = walletContext();
          if (scope.user.id !== current?.user.id || scope.ledger.id !== current?.ledger.id || scope.ledger.role !== current?.ledger.role) {
            // Module-level ledger keys must be initialized again for a new scope.
            redirecting = true; lockWalletScope(); window.location.reload();
          }
          failures = 0;
          return;
        }
        activateWalletScope(scope);
        await preloadD1Cache();
        if (disposed || closing || redirecting) return;
        // Set the account and ledger namespace before App's module constants initialize.
        const { default: component } = await import('../App');
        if (!disposed && !closing && !redirecting) {
          opened = true; failures = 0; setError(''); setApp(() => component);
        }
      } catch (cause) {
        if (disposed || closing || redirecting) return;
        if (isWalletAccessDenied(cause)) { loseAccess(); return; }
        // A suspended WebView or an unavailable network does not revoke a session.
        // Keep App mounted so an open form and unsaved input remain untouched.
        retryTimer = window.setTimeout(() => { void connect(); }, Math.min(1000 * 2 ** Math.min(failures++, 4), 15000));
      } finally {
        inFlight = false;
      }
    }
    function loseAccess() {
      if (disposed || closing || redirecting) return;
      redirecting = true; clearRetry(); lockWalletScope(); setApp(null); setStage('sleep');
      setSignInRequired(true);
    }
    async function logout() {
      if (disposed || logoutInFlight || redirecting) return;
      closing = true; logoutInFlight = true; clearRetry();
      lockWalletScope(); setApp(null); setStage('sleep'); setLoggingOut(true); setError('');
      try { await auth.logout(); if (!disposed) setSignInRequired(true); }
      catch { if (!disposed) setError('로그아웃을 완료하지 못했어요. 연결을 확인한 뒤 다시 시도해주세요.'); }
      finally { logoutInFlight = false; if (!disposed) setLoggingOut(false); }
    }
    retry.current = () => { if (closing) void logout(); else void connect(); };
    void connect();
    const resume = () => { if (document.visibilityState === 'visible') void connect(); else clearRetry(); };
    const signOut = () => { void logout(); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    window.addEventListener('pageshow', resume);
    window.addEventListener('memoney:wallet-access-lost', loseAccess);
    window.addEventListener('memoney:wallet-logout', signOut);
    const timer = window.setInterval(resume, 60000);
    return () => {
      disposed = true; clearRetry(); window.clearInterval(timer); retry.current = () => {};
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('memoney:wallet-access-lost', loseAccess);
      window.removeEventListener('memoney:wallet-logout', signOut);
    };
  }, []);
  return <><div inert={stage !== 'ready'} aria-hidden={stage !== 'ready'} style={{ visibility: stage === 'ready' ? 'visible' : 'hidden' }}>
    {App && <App onReady={appReady} />}
  </div>{stage !== 'ready' && <WalletConnectionScreen complete={stage === 'complete'} onComplete={enterApp} />}{error && <section className="wallet-connection-status" aria-live="polite">
    <p>{error}</p>
    <button className="secondary-button" disabled={loggingOut} onClick={() => retry.current()}>다시 시도</button>
  </section>}</>;
}
