import { useEffect, useState } from 'react';
import './account-settings.css';

export function AccountSettings() {
  const [state, setState] = useState<'checking'|'signed-in'|'signed-out'|'error'>('checking');
  const [membership, setMembership] = useState<'free'|'premium_yearly'|'premium_tester'|'premium_admin'|null>(null);
  const [email, setEmail] = useState(''), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => { let disposed = false; setState('checking'); setMembership(null);
    void (async () => {
      const response=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
      if(response.status===401) {if(!disposed)setState('signed-out');return;}
      if(!response.ok)throw Error('AUTH_UNAVAILABLE');
      let address='';
      try {const sharing=await fetch('/api/wallet/sharing',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
        if(sharing.ok)address=(await sharing.json()).user?.email || '';
      } catch { /* A verified session remains signed in if contact metadata is unavailable. */ }
      if(!disposed){setEmail(address);setState('signed-in');}
      try {
        const response=await fetch('/api/account/membership',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
        if(response.ok){const data=await response.json(); if(!disposed&&['free','premium_yearly','premium_tester','premium_admin'].includes(data.plan))setMembership(data.plan);}
      } catch { /* A membership lookup failure never fabricates a free or premium grant. */ }
    })().catch(()=>{if(!disposed)setState('error');});
    const failed=()=>{setBusy(false);setRevision(value=>value+1);};window.addEventListener('memoney:logout-failed',failed);
    return()=>{disposed=true;window.removeEventListener('memoney:logout-failed',failed);};
  },[revision]);
  return <div className="settings-row account-settings-row"><div className="account-settings-label"><strong>계정</strong>
    <span>{state==='checking'?'확인 중…':state==='signed-in'?(email || 'Google 로그인됨'):state==='signed-out'?'로그인 안 됨':'연결 확인 필요'}</span>
    {state==='signed-in'&&membership&&<span className={`account-membership ${membership==='free'?'is-free':'is-premium'}`}>
      {membership==='premium_admin'?'슈퍼 관리자 · 프리미엄':membership==='premium_tester'?'프리미엄 회원 · 내부 테스터':membership==='premium_yearly'?'프리미엄 회원':'일반 회원'}
    </span>}</div>
    <div className="account-settings-actions">
    {state==='signed-in'&&membership==='premium_admin'&&<a className="account-settings-action" href={`/account-management?return=${location.pathname==='/guest'?'local':'cloud'}`}>계정 관리</a>}
    <button type="button" className="account-settings-action" disabled={state==='checking'||busy} onClick={()=>{
      if(state==='signed-in'){setBusy(true);window.dispatchEvent(new Event('memoney:wallet-logout'));}
      else if(state==='signed-out')location.assign('/signin?account=local');
      else setRevision(value=>value+1);
    }}>{busy?'로그아웃 중…':state==='checking'?'확인 중…':state==='signed-in'?'로그아웃':state==='error'?'다시 확인':'Google 로그인'}</button></div></div>;
}
