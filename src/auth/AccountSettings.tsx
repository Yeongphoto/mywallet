import { useEffect, useState } from 'react';
import './account-settings.css';

export function AccountSettings() {
  const [state, setState] = useState<'checking'|'signed-in'|'signed-out'|'error'>('checking');
  const [email, setEmail] = useState(''), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => { let disposed = false; setState('checking');
    void (async () => {
      const response=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
      if(response.status===401) {if(!disposed)setState('signed-out');return;}
      if(!response.ok)throw Error('AUTH_UNAVAILABLE');
      let address='';
      try {const sharing=await fetch('/api/wallet/sharing',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
        if(sharing.ok)address=(await sharing.json()).user?.email || '';
      } catch { /* A verified session remains signed in if contact metadata is unavailable. */ }
      if(!disposed){setEmail(address);setState('signed-in');}
    })().catch(()=>{if(!disposed)setState('error');});
    const failed=()=>{setBusy(false);setRevision(value=>value+1);};window.addEventListener('memoney:logout-failed',failed);
    return()=>{disposed=true;window.removeEventListener('memoney:logout-failed',failed);};
  },[revision]);
  return <div className="settings-row account-settings-row"><div className="account-settings-label"><strong>계정</strong>
    <span>{state==='checking'?'확인 중…':state==='signed-in'?(email || 'Google 로그인됨'):state==='signed-out'?'로그인 안 됨':'연결 확인 필요'}</span></div>
    <button type="button" className="account-settings-action" disabled={state==='checking'||busy} onClick={()=>{
      if(state==='signed-in'){setBusy(true);window.dispatchEvent(new Event('memoney:wallet-logout'));}
      else if(state==='signed-out')location.assign('/signin?account=local');
      else setRevision(value=>value+1);
    }}>{busy?'로그아웃 중…':state==='checking'?'확인 중…':state==='signed-in'?'로그아웃':state==='error'?'다시 확인':'Google 로그인'}</button></div>;
}
