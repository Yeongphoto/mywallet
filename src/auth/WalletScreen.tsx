import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { registerPlugin } from '@capacitor/core';
import { preloadD1Cache } from '../d1-cache-preload';
import { createAuthClient } from './auth-client';
import type { NativeGoogle } from './auth-client';
import { activateWalletScope, lockWalletScope, readWalletContext, walletContext } from './wallet-scope';
import './signin.css';
import { useAppAppearance } from './use-app-appearance';
import { LoadingScreen } from '../LoadingScreen';
import { useLaunchReady } from './use-launch-ready';

const auth = createAuthClient(registerPlugin<NativeGoogle>('MemoneyGoogleAuth'));
export default function WalletScreen() {
  const appearance = useAppAppearance();
  const [App, setApp] = useState<ComponentType | null>(null);
  const [error, setError] = useState('');
  useLaunchReady(!!error);
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => {
    let disposed = false;
    async function open() {
      try {
        const scope = await readWalletContext();
        if (disposed) return;
        activateWalletScope(scope);
        await preloadD1Cache();
        if (disposed) return;
        // Set the account and ledger namespace before App's module constants initialize.
        const { default: component } = await import('../App');
        if (!disposed) setApp(() => component);
      } catch {
        if (!disposed) { lockWalletScope(); setError('가계부에 연결할 수 없어요. 로그인과 연결 상태를 다시 확인해주세요.'); }
      }
    }
    async function revalidate() {
      if (document.visibilityState !== 'visible' || !walletContext()) return;
      try {
        const next = await readWalletContext(), current = walletContext();
        if (next.user.id !== current?.user.id || next.ledger.id !== current?.ledger.id || next.ledger.role !== current?.ledger.role) loseAccess();
      } catch { loseAccess(); }
    }
    function loseAccess() {
      if (disposed) return;
      lockWalletScope(); setApp(null);
      window.location.replace('/signin');
    }
    async function logout() {
      lockWalletScope(); setApp(null); setLoggingOut(true); setError('');
      try { await auth.logout(); window.location.replace('/signin'); }
      catch { setError('로그아웃을 완료하지 못했어요. 연결을 확인한 뒤 다시 시도해주세요.'); }
      finally { if (!disposed) setLoggingOut(false); }
    }
    void open();
    const resume = () => { void revalidate(); };
    const signOut = () => { void logout(); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('memoney:wallet-access-lost', loseAccess);
    window.addEventListener('memoney:wallet-logout', signOut);
    const timer = window.setInterval(resume, 60000);
    return () => {
      disposed = true; window.clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('memoney:wallet-access-lost', loseAccess);
      window.removeEventListener('memoney:wallet-logout', signOut);
    };
  }, []);
  if (App) return <App />;
  if (!error) return <LoadingScreen />;
  return <main className="memoney-signin"><section className="signin-content">
    <img className="signin-logo" src={appearance.logo} alt="Memoney" /><p className="signin-description" role="status">{error || (loggingOut ? '로그아웃 중…' : '장부를 불러오는 중…')}</p>
    {error && <button className="secondary-button" onClick={() => window.location.replace('/signin')}>로그인</button>}
  </section></main>;
}
