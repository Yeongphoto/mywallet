import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { registerPlugin } from '@capacitor/core';
import { createAuthClient } from './auth-client';
import type { NativeGoogle } from './auth-client';
import { activateLocalWallet, readWalletContext } from './wallet-scope';
import { localSnapshot, MODE_KEY } from './local-wallet';
import { preparePersonalLogin } from './local-sync';
import './signin.css';
import './guest.css';
import { useAppAppearance } from './use-app-appearance';
import { LoadingScreen } from '../LoadingScreen';
import { useLaunchReady } from './use-launch-ready';

const auth = createAuthClient(registerPlugin<NativeGoogle>('MemoneyGoogleAuth'));
export default function GuestScreen() {
  const appearance = useAppAppearance();
  const [App, setApp] = useState<ComponentType | null>(null);
  const [fatal, setFatal] = useState('');
  useLaunchReady(!!fatal);
  const [saveFailed, setSaveFailed] = useState(false);
  const [open, setOpen] = useState(new URLSearchParams(window.location.search).has('sync'));
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState('');
  const [logoutFailed, setLogoutFailed] = useState(false);
  useEffect(() => {
    let disposed = false;
    try {
      const id = activateLocalWallet();
      localSnapshot(window.localStorage, id);
      void import('../App').then(m => { if (!disposed) setApp(() => m.default); })
        .catch(() => { if (!disposed) setFatal('장부를 열지 못했어요. 다시 실행해 주세요.'); });
    } catch { setFatal('기기의 기록을 열 수 없어요. 앱 데이터를 지우지 말고 저장 공간과 백업을 확인해 주세요.'); }
    const show = () => { setOpen(true); setNotice(''); };
    const failed = () => setSaveFailed(true);
    const backupFailed = () => { setOpen(true); setNotice('백업을 저장하지 못했어요. 저장 위치와 공간을 확인해 주세요.'); };
    window.addEventListener('memoney:open-local-sync', show);
    window.addEventListener('memoney:local-save-failed', failed);
    window.addEventListener('memoney:local-backup-failed', backupFailed);
    let loggingOut = false;
    const signOut = () => {
      if (loggingOut) return; loggingOut = true; setLogoutFailed(false);
      void auth.logout().then(() => { window.history.replaceState(null,'','/guest#settings'); window.location.reload(); }).catch(() => {
        loggingOut = false; setLogoutFailed(true); window.dispatchEvent(new Event('memoney:logout-failed'));
      });
    };
    window.addEventListener('memoney:wallet-logout',signOut);
    return () => { disposed = true; window.removeEventListener('memoney:wallet-logout',signOut); window.removeEventListener('memoney:open-local-sync', show); window.removeEventListener('memoney:local-save-failed', failed); window.removeEventListener('memoney:local-backup-failed', backupFailed); };
  }, []);
  useEffect(() => {
    if (!open) return;
    let disposed = false;
    setChecking(true); setConnected(false);
    void preparePersonalLogin().then(() => readWalletContext()).then(() => { if (!disposed) setConnected(true); }).catch(error => {
      if (!disposed && error.message !== 'UNAUTHENTICATED') setNotice(error.message === 'PERSONAL_ONBOARDING_WAITING' ? '다른 기기에서 처음 연결하고 있어요. 잠시 후 다시 시도해 주세요.' : '개인 장부에 연결하지 못했어요. 기기 기록은 그대로 보관됩니다.');
    }).finally(() => { if (!disposed) setChecking(false); });
    return () => { disposed = true; };
  }, [open]);
  if (fatal) return <main className="memoney-signin"><section className="signin-content"><img className="signin-logo" src={appearance.logo} alt="Memoney" /><p role="alert">{fatal}</p></section></main>;
  return <>
    <div inert={open}>{App ? <App /> : <LoadingScreen />}</div>
    {saveFailed && <div className="guest-save-error" role="alert">저장 공간을 확인해 주세요.</div>}
    {logoutFailed && <div className="guest-save-error" role="alert">로그아웃하지 못했어요. 연결을 확인해 주세요.</div>}
    {open && <div className="guest-sync-backdrop"><section className="guest-sync-card" role="dialog" aria-modal="true" aria-labelledby="guest-sync-title" aria-busy={checking}>
      <header className="guest-sync-header"><h2 id="guest-sync-title">Google 개인 장부</h2>
        <button type="button" className="guest-sync-close" aria-label="닫기" disabled={checking} onClick={() => { setOpen(false); window.history.replaceState(null, '', '/guest#settings'); }}>×</button>
      </header>
      <button className="primary-button" disabled={checking || saveFailed} onClick={() => {
        if (connected) {window.localStorage.setItem(MODE_KEY, 'shared-web');window.location.replace('/wallet#settings');}
        else window.location.assign('/signin?sync=local');
      }}>{checking ? '연결 확인 중…' : connected ? '개인 장부 열기' : 'Google 로그인'}</button>
      {notice && <p className="guest-sync-feedback" role="status" aria-live="polite">{notice}</p>}
    </section></div>}
  </>;
}
