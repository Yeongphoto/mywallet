import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { registerPlugin } from '@capacitor/core';
import { createAuthClient } from './auth-client';
import type { NativeGoogle } from './auth-client';
import { activateLocalWallet, readWalletContext } from './wallet-scope';
import type { WalletContext } from './wallet-scope';
import { activeGuestId, GUEST_ID_KEY, localSnapshot, MODE_KEY } from './local-wallet';
import { readImportJob, runImportJob, startImportJob } from './local-sync';
import './signin.css';
import './guest.css';
import { useAppAppearance } from './use-app-appearance';
import { LoadingScreen } from '../LoadingScreen';
import { useLaunchReady } from './use-launch-ready';

const messages: Record<string, string> = {
  RULE_TIME_UNSUPPORTED: '시간이 지정된 정기기록은 현재 웹앱과 연결할 수 없어요. 기기의 기록은 그대로 보관됩니다.',
  SYNC_ACCOUNT_CHANGED: '처음 선택한 계정과 가계부로 다시 연결해 주세요.',
  SYNC_IMPORTED_RECORD_CHANGED: '공유 가계부에서 가져온 기록이 변경됐어요. 덮어쓰지 않고 동기화를 멈췄어요.',
  WALLET_WRITE_DENIED: '이 계정에 기록을 저장할 가계부가 아직 연결되지 않았어요.',
};
const auth = createAuthClient(registerPlugin<NativeGoogle>('MemoneyGoogleAuth'));
export default function GuestScreen() {
  const appearance = useAppAppearance();
  const [App, setApp] = useState<ComponentType | null>(null);
  const [fatal, setFatal] = useState('');
  useLaunchReady(!!fatal);
  const [saveFailed, setSaveFailed] = useState(false);
  const [open, setOpen] = useState(new URLSearchParams(window.location.search).has('sync'));
  const [target, setTarget] = useState<WalletContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState('');
  const [progress, setProgress] = useState('');
  const [pending, setPending] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  useEffect(() => {
    let disposed = false;
    try {
      const id = activateLocalWallet();
      localSnapshot(window.localStorage, id); // Corrupt data must never become an empty ledger.
      const job = readImportJob(id);
      if (job && !job.completed) { setPending(true); setOpen(true); }
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
    setChecking(true); setTarget(null);
    void readWalletContext().then(c => { if (!disposed) setTarget(c); }).catch(() => {
      if (!disposed) setNotice('');
    }).finally(() => { if (!disposed) setChecking(false); });
    return () => { disposed = true; };
  }, [open]);
  function enterCloud(retireGuest = false) {
    window.localStorage.setItem(MODE_KEY, 'shared-web');
    if (retireGuest) window.localStorage.removeItem(GUEST_ID_KEY); // Archive remains; next guest ledger starts separately.
    window.location.replace('/wallet');
  }
  async function synchronize() {
    if (!target || busy || saveFailed) return;
    setBusy(true); setNotice('');
    try {
      const job = startImportJob(activeGuestId(), target);
      setPending(!job.completed);
      await runImportJob(job, readWalletContext, window.fetch.bind(window), window.localStorage, (n, total) => setProgress(`${n} / ${total}`));
      enterCloud(true);
    } catch (error) {
      setNotice(messages[(error as Error).message] || '동기화하지 못했어요. 다시 시도해 주세요.');
    } finally { setBusy(false); }
  }
  const data = (() => { try { return localSnapshot(window.localStorage, activeGuestId()); } catch { return null; } })();
  if (fatal) return <main className="memoney-signin"><section className="signin-content"><img className="signin-logo" src={appearance.logo} alt="Memoney" /><p role="alert">{fatal}</p></section></main>;
  return <>
    <div inert={open}>{App ? <App /> : <LoadingScreen />}</div>
    {saveFailed && <div className="guest-save-error" role="alert">저장 공간을 확인해 주세요.</div>}
    {logoutFailed && <div className="guest-save-error" role="alert">로그아웃하지 못했어요. 연결을 확인해 주세요.</div>}
    {open && <div className="guest-sync-backdrop"><section className="guest-sync-card" role="dialog" aria-modal="true" aria-labelledby="guest-sync-title" aria-busy={busy || checking}>
      <header className="guest-sync-header"><h2 id="guest-sync-title">동기화</h2>
        <button type="button" className="guest-sync-close" aria-label="닫기" disabled={busy || pending} onClick={() => { setOpen(false); window.history.replaceState(null, '', '/guest#settings'); }}>×</button>
      </header>
      <div className="guest-sync-counts">거래 {data?.transactions.length || 0} · 자산 {data?.assets.length || 0} · 정기 {data?.recurringRules.length || 0}</div>
      {target ? <>
        <button className="primary-button" disabled={busy || saveFailed || target.ledger.role === 'viewer'} onClick={() => void synchronize()}>{busy ? `동기화 중 ${progress}` : pending ? '이어서 동기화' : `${target.ledger.name || '선택한 장부'}에 합치기`}</button>
      </> : <button className="primary-button" disabled={busy || checking} onClick={() => window.location.assign('/signin?sync=local')}>{checking ? '연결 확인 중…' : 'Google 로그인'}</button>}
      {notice && <p className="guest-sync-feedback" role="status" aria-live="polite">{notice}</p>}
    </section></div>}
  </>;
}
