import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { AuthError, createAuthClient } from './auth-client';
import type { NativeGoogle, User } from './auth-client';
import { readWalletContext } from './wallet-scope';
import { activeGuestId, MODE_KEY } from './local-wallet';
import './signin.css';
import { useAppAppearance } from './use-app-appearance';
import { appLogoSrc } from './app-appearance';
import { BrandWordmark } from '../BrandWordmark';
import { LoadingScreen } from '../LoadingScreen';
import { useLaunchReady } from './use-launch-ready';

const native = registerPlugin<NativeGoogle>('MemoneyGoogleAuth');
const auth = createAuthClient(native);
const isAndroid = Capacitor.getPlatform() === 'android';

function message(error: unknown) {
  const code = error instanceof AuthError ? error.code : (error as { code?: string } | null)?.code;
  const messages: Record<string, string> = {
    CANCELLED: '로그인을 취소했어요. 준비되면 다시 시작해주세요.',
    NO_CREDENTIAL: '기기의 Google 계정을 확인해주세요. 계정이 없다면 Android 설정에서 추가할 수 있어요.',
    CONFIGURATION: '로그인 설정을 확인해야 해요. 앱을 다시 실행해주세요.',
    NETWORK: '서버에 연결할 수 없어요. 연결 상태를 확인하고 다시 시도해주세요.',
    LOGIN_CHALLENGE_EXPIRED: '로그인 시간이 지났어요. 다시 시작해주세요.',
    INVALID_ID_TOKEN: 'Google 인증을 확인할 수 없어요. 다시 로그인해주세요.',
    AUTH_NOT_CONFIGURED: '로그인 설정을 준비하고 있어요. 잠시 후 다시 시도해주세요.',
    SESSION_NOT_SAVED: '로그인 상태를 저장하지 못했어요. 다시 시도해주세요.',
  };
  return messages[code ?? ''] || '로그인을 완료하지 못했어요. 잠시 후 다시 시도해주세요.';
}

export default function SignInScreen() {
  const appearance = useAppAppearance();
  const [user, setUser] = useState<User | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);
  const generation = useRef(0);
  const initialized = useRef(false);
  const [walletUnavailable, setWalletUnavailable] = useState(false);
  useLaunchReady(!loading && !busy && (!user || walletUnavailable));

  useEffect(() => {
    if (!user) return;
    if (new URLSearchParams(window.location.search).get('account') === 'local') {
      window.location.replace('/guest#settings'); return;
    }
    let disposed = false;
    void readWalletContext().then(() => {
      if (!disposed && !inFlight.current) {
        const syncing = new URLSearchParams(window.location.search).get('sync') === 'local';
        if (!syncing) window.localStorage.setItem(MODE_KEY, 'shared-web');
        window.location.replace(syncing ? '/guest?sync=1#settings' : new URLSearchParams(window.location.search).get('wallet') === 'shared' ? '/wallet#settings' : '/wallet');
      }
    }).catch(error => {
      if (disposed) return;
      if (error.message === 'LEDGER_ACCESS_DENIED') { window.localStorage.setItem(MODE_KEY, 'local'); window.location.replace('/guest'); }
      else setWalletUnavailable(true);
    });
    return () => { disposed = true; };
  }, [user]);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    const version = ++generation.current;
    setWalletUnavailable(false);
    if (!initialized.current) setLoading(true);
    setNotice('');
    try {
      const configuration = await auth.configuration();
      const requireGoogle = new URLSearchParams(window.location.search).get('reauth') === '1';
      const session = configuration.enabled && !requireGoogle ? await auth.session() : null;
      if (version !== generation.current) return;
      setEnabled(configuration.enabled);
      setUser(session);
      if (!configuration.enabled) setNotice('로그인 설정을 준비하고 있어요.');
    } catch (error) {
      if (version !== generation.current) return;
      setUser(null);
      setEnabled(false);
      setNotice(message(error));
    } finally { if (version === generation.current) { initialized.current = true; setLoading(false); } }
  }, []);

  useEffect(() => {
    void refresh();
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', resume);
    const expiryCheck = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60000);
    return () => {
      generation.current++;
      document.removeEventListener('visibilitychange', resume);
      window.clearInterval(expiryCheck);
    };
  }, [refresh]);

  async function perform(action: 'signin' | 'logout') {
    if (inFlight.current) return;
    inFlight.current = true;
    generation.current++;
    setBusy(true);
    setWalletUnavailable(false);
    setNotice('');
    try {
      if (action === 'signin') setUser(await auth.signIn());
      else {
        const result = await auth.logout();
        setUser(null);
        if (!result.providerCleared) setNotice('로그아웃했어요. 다음 로그인에서 Google 계정을 다시 선택해주세요.');
      }
    } catch (error) { setNotice(message(error)); }
    finally { inFlight.current = false; setBusy(false); setLoading(false); }
  }

  if (loading || (user && !walletUnavailable)) return <LoadingScreen />;
  return (
    <main className="memoney-signin mememo-signin" data-tone={appearance.resolved}>
      <header className="signin-brand" aria-label="Memoney">
        <img src={appLogoSrc('mememo',appearance.resolved)} alt="" />
        <strong className="signin-wordmark"><BrandWordmark /></strong>
      </header>
      <section className="signin-content" aria-busy={loading || busy}>
        <h1>{user ? '연결 확인' : '시작하기'}</h1>
        <div className="signin-card">
          {user ? (
            <>
              <button className="secondary-button" disabled={busy} onClick={() => void refresh()}>다시 연결</button>
            </>
          ) : (
            <>
              <button className="signin-google" aria-label="Google로 계속하기" disabled={!enabled || !isAndroid || loading || busy} onClick={() => void perform('signin')}>
                <img src="/google-g.png" alt="" aria-hidden="true" />
                <span>Google로 계속하기</span>
              </button>
            </>
          )}
          {!enabled && !loading && <button className="secondary-button" disabled={busy} onClick={() => void refresh()}>다시 확인</button>}
          <button className="signin-local" disabled={busy} onClick={() => {
            try { activeGuestId(); window.localStorage.setItem(MODE_KEY, 'local'); window.location.replace('/guest'); }
            catch { setNotice('기기에 저장할 수 없어요. 저장 공간을 확인해 주세요.'); }
          }}>로그인 없이 이용하기</button>
        </div>
        <div className="signin-feedback" role="status" aria-live="polite">
          {busy ? (user ? '로그아웃하고 있어요…' : 'Google 계정을 확인하고 있어요…') : loading ? '로그인 상태를 확인하고 있어요…' : notice}
        </div>
      </section>
    </main>
  );
}
