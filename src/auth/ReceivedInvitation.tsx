import { useEffect, useRef, useState } from 'react';
import { clearInvitation, pendingInvitation, rememberInvitation } from './invitation-client';
import { MODE_KEY } from './local-wallet';
import { selectCloudLedger } from './wallet-scope';
import './received-invitation.css';

type Invitation = { id: string; name: string; role: string };
export function ReceivedInvitation() {
  const [invite, setInvite] = useState<Invitation | null>(null), [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(''), [needsLogin, setNeedsLogin] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dismissed = useRef(new Set<string>());
  const linkToken = useRef(pendingInvitation());
  useEffect(() => { let disposed = false;
    const check = () => { if (document.visibilityState !== 'visible') return;
      void fetch('/api/wallet/sharing',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)})
      .then(async response => { if (!response.ok) return; const data = await response.json();
        if (!disposed) { const next = data.receivedInvitations?.find((item: Invitation) => !dismissed.current.has(item.id));
          setInvite(current => current?.id === next?.id ? current : next || null); }
      }).catch(() => {});
    };
    check(); document.addEventListener('visibilitychange',check);
    const timer = window.setInterval(check,30000);
    return () => { disposed = true; clearInterval(timer); document.removeEventListener('visibilitychange',check); };
  }, []);
  useEffect(() => { if (!invite) return;
    const focusBefore = document.activeElement as HTMLElement | null; closeRef.current?.focus();
    const siblings = [...document.querySelector('.app-shell')?.children || []].filter(element => element instanceof HTMLElement && !element.classList.contains('received-invitation-backdrop')) as HTMLElement[];
    const inertBefore = siblings.map(element => element.inert); siblings.forEach(element => { element.inert = true; });
    return () => { siblings.forEach((element,index) => { element.inert = inertBefore[index]; }); focusBefore?.focus(); };
  }, [invite]);
  if (!invite) return null;
  async function accept() {
    if (!invite || busy) return; setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/wallet/sharing',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
        signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'accept',invitationId:invite.id})});
      const data = await response.json();
      if (!response.ok) { if (data.error === 'REAUTHENTICATE' || data.error === 'UNAUTHENTICATED') { setNeedsLogin(true); throw Error('Google 계정을 다시 확인해 주세요.'); }
        throw Error(data.error === 'INVITATION_ACCOUNT_MISMATCH' ? '초대받은 계정으로 로그인해 주세요.' : '만료되거나 취소된 초대예요.'); }
      clearInvitation(); if(data.ledgerId)selectCloudLedger(data.ledgerId); localStorage.setItem(MODE_KEY,'shared-web'); location.assign('/wallet');
    } catch (error) { setNotice((error as Error).name === 'TimeoutError' || (error as Error).name === 'TypeError' ? '연결을 확인하고 다시 시도해 주세요.' : (error as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="received-invitation-backdrop"><section className="received-invitation-card" role="dialog" aria-modal="true" aria-labelledby="received-invitation-title" onKeyDown={event => {
    if (event.key === 'Escape' && !busy) { dismissed.current.add(invite.id); setInvite(null); }
    if (event.key === 'Tab') { const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[buttons.length - 1]?.focus(); }
      else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0]?.focus(); }
    }
  }}>
    <h2 id="received-invitation-title">공유 장부 초대</h2>
    <div className="received-invitation-details"><strong>{invite.name === 'Shared wallet' ? '공유 장부' : invite.name}</strong><span>{invite.role === 'editor' ? '함께 기록' : '보기만'}</span></div>
    {notice && <p role="status">{notice}</p>}
    <div className="received-invitation-actions"><button ref={closeRef} type="button" className="secondary-button" disabled={busy} onClick={() => { dismissed.current.add(invite.id); setInvite(null); }}>나중에</button>
      <button type="button" className="primary-button" disabled={busy} onClick={() => {
        if (needsLogin) { if (linkToken.current) rememberInvitation(linkToken.current); location.assign('/signin?reauth=1'); }
        else void accept();
      }}>{busy ? '연결 중…' : needsLogin ? 'Google 계정 확인' : '참여'}</button></div>
  </section></div>;
}
