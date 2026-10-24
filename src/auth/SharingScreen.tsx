import { useEffect, useRef, useState } from 'react';
import { selectCloudLedger, SELECTED_LEDGER_KEY } from './wallet-scope';
import { MODE_KEY } from './local-wallet';
import { registerPlugin } from '@capacitor/core';
import { createAuthClient } from './auth-client';
import type { NativeGoogle } from './auth-client';
import { clearInvitation, invitationToken, pendingInvitation, rememberInvitation } from './invitation-client';
import { useAppAppearance } from './use-app-appearance';
import { useLaunchReady } from './use-launch-ready';
import { LoadingScreen } from '../LoadingScreen';
import './sharing.css';

type SharingState = { user: { id: string; email: string | null }; ledger: { id: string; name?:string; role: string } | null;
  personalLedger?: { id: string; name: string } | null;
  members: Array<{ id: string; email: string | null; role: string }>;
  invitations: Array<{ id: string; email: string; role: string; expiresAt: number; revokedAt: number | null; acceptedAt: number | null }> };
const messages: Record<string, string> = {
  UNAUTHENTICATED: 'Google 로그인이 필요해요.', REAUTHENTICATE: '초대를 수락하려면 다시 로그인해 주세요.',
  INVITATION_ACCOUNT_MISMATCH: '초대받은 Google 계정으로 로그인해 주세요.', INVITATION_UNAVAILABLE: '만료되거나 취소된 초대예요.',
  ALREADY_MEMBER: '이미 참여한 계정이에요.', RATE_LIMITED: '잠시 후 다시 초대해 주세요.',
  SHARED_LEDGER_LIMIT:'내가 소유한 공유 장부는 1개까지 만들 수 있어요.', INVALID_CREATION:'장부 이름과 시작 방식을 확인해 주세요.',
  CREATION_UNAVAILABLE:'연결을 확인한 뒤 복사를 이어서 진행해 주세요.', INVALID_LEDGER_NAME:'장부 이름은 1~30자로 입력해 주세요.',
  PERSONAL_SAVE_PENDING:'개인 장부에 저장 중인 기록이 있어요. 개인 장부에서 저장을 완료한 뒤 복사해 주세요.',
  INVALID_INVITATION: 'Gmail 주소와 권한을 확인해 주세요.', LEDGER_ACCESS_DENIED: '장부 소유자만 관리할 수 있어요.',
};
const auth = createAuthClient(registerPlugin<NativeGoogle>('MemoneyGoogleAuth'));
let managedLedgerId='';
async function api(body?: unknown) {
  const selected=localStorage.getItem(SELECTED_LEDGER_KEY);
  const ledgerId=body?managedLedgerId:selected;
  const response = await fetch('/api/wallet/sharing', { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    signal: AbortSignal.timeout(15000), headers: {...(body ? { 'Content-Type': 'application/json' } : {}),...(ledgerId?{'X-Memoney-Ledger':ledgerId}:{})}, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'SHARING_UNAVAILABLE'); if(!body)managedLedgerId=data.ledger?.id || '';return data;
}
type Creation={id:string;operationId:string;status:string;source:string;completed:number;total:number;percent:number};
type LedgerList={ledgers:Array<{id:string;name:string;kind:string;role:string}>;creation:Creation|null};
async function ledgerApi(body?:unknown){const r=await fetch('/api/wallet/ledgers',{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',
  signal:AbortSignal.timeout(30000),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const data=await r.json();if(!r.ok)throw Error(data.error||'CREATION_UNAVAILABLE');return data;}
export default function SharingScreen() {
  const appearance = useAppAppearance();
  const [state, setState] = useState<SharingState | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(''), [needLogin, setNeedLogin] = useState(false);
  const [email, setEmail] = useState(''), [role, setRole] = useState('editor');
  const [inviteInput, setInviteInput] = useState(() => pendingInvitation());
  const [preview, setPreview] = useState<{ name: string; role: string } | null>(null);
  const [link, setLink] = useState('');
  const [books,setBooks]=useState<LedgerList|null>(null),[creation,setCreation]=useState<Creation|null>(null);
  const [name,setName]=useState(''),[source,setSource]=useState('personal');
  const operation=useRef<string>(''),copying=useRef(false);
  useLaunchReady(!loading);
  const describe = (error: unknown) => { const code = (error as Error).message; if (['UNAUTHENTICATED','REAUTHENTICATE'].includes(code)) setNeedLogin(true);
    setNotice(messages[code] || '연결을 확인하고 다시 시도해 주세요.'); };
  async function refresh() { setState(await api());const list=await ledgerApi();setBooks(list);setCreation(list.creation); setNeedLogin(false); }
  useEffect(() => { let disposed = false;
    void api().then(data => { if (!disposed) setState(data); }).catch(error => { if (!disposed) describe(error); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, []);
  useEffect(()=>{let disposed=false;void ledgerApi().then(list=>{if(!disposed){setBooks(list);setCreation(list.creation);}}).catch(()=>{});return()=>{disposed=true;};},[]);
  async function copy(start?:unknown){if(copying.current)return;copying.current=true;
    try{if(start&&source==='personal'&&state?.personalLedger){
        const prefix=`memoney:user:${state.user.id}:ledger:${state.personalLedger.id}:`;
        const pending=localStorage.getItem(prefix+'mywallet:v2:pendingTransactionOperations');
        if(Number(localStorage.getItem(prefix+'mywallet:v2:pendingSyncAt'))>0||pending&&JSON.parse(pending).length)throw Error('PERSONAL_SAVE_PENDING');
      }
      let job:Creation=(await ledgerApi(start||{action:'continue',ledgerId:creation!.id})).creation;setCreation(job);
      while(job.status!=='ready'){await new Promise(resolve=>setTimeout(resolve,200));job=(await ledgerApi({action:'continue',ledgerId:job.id})).creation;setCreation(job);}
      await refresh();selectCloudLedger(job.id);localStorage.setItem(MODE_KEY,'shared-web');setNotice('공유 장부를 만들었어요.');
    }finally{copying.current=false;}}
  useEffect(() => { const incoming = () => { const token = pendingInvitation(); if (token) { setInviteInput(token); setPreview(null); } };
    window.addEventListener('hashchange', incoming); return () => window.removeEventListener('hashchange', incoming);
  }, []);
  async function perform(action: () => Promise<void>) { if (busy) return; setBusy(true); setNotice('');
    try { await action(); } catch (error) { describe(error); } finally { setBusy(false); } }
  function login() { const token = invitationToken(inviteInput); if (token) rememberInvitation(token); location.assign('/signin?join=1&reauth=1'); }
  if (loading) return <LoadingScreen />;
  return <main className="sharing-page">
    <header className="sharing-header"><button type="button" aria-label="뒤로" onClick={() => location.assign(new URLSearchParams(location.search).get('return')==='local'?'/guest#settings':state?.ledger || state?.personalLedger ? '/wallet#settings' : '/guest#settings')}>‹</button>
      <h1>{state?.ledger?'공유 장부 관리':'공유 장부 만들기'}</h1><img src={appearance.logo} alt="Memoney" /></header>
    {state && <div className="sharing-account"><span>{state.user.email || 'Google 계정'}</span>
      <button type="button" disabled={busy} onClick={() => void perform(async () => { await auth.logout(); login(); })}>계정 변경</button></div>}
    {notice && <p className="sharing-notice" role="status">{notice}</p>}
    {needLogin && <button type="button" className="primary-button" disabled={busy} onClick={login}>Google 로그인</button>}
    {books && !books.creation && !creation && <section className="sharing-card"><h2>공유 장부 만들기</h2>
      <form onSubmit={e=>{e.preventDefault();if(!operation.current)operation.current=crypto.randomUUID();void perform(()=>copy({action:'create',name,source,operationId:operation.current}));}}>
        <label>장부 이름<input aria-label="새 공유 장부 이름" required maxLength={60} placeholder="우리 가계부" value={name} disabled={busy} onChange={e=>{setName(e.target.value);operation.current='';}}/></label>
        <div className="sharing-start-options" role="group" aria-label="시작 방식">
          <button type="button" aria-pressed={source==='personal'} disabled={busy||!state?.personalLedger} onClick={()=>{setSource('personal');operation.current='';}}>개인 장부 복사하기</button>
          <button type="button" aria-pressed={source==='empty'} disabled={busy} onClick={()=>{setSource('empty');operation.current='';}}>빈 장부로 시작하기</button>
        </div>
        <button className="primary-button" disabled={busy||!name.trim()||source==='personal'&&!state?.personalLedger}>{busy?'복사 준비 중…':'공유 장부 만들기'}</button>
      </form>
    </section>}
    {creation?.status==='copying' && <section className="sharing-card sharing-copy" role="status" aria-live="polite"><h2>{creation.source==='personal'?'개인 장부를 복사하고 있어요':'공유 장부를 만들고 있어요'}</h2>
      <div className="sharing-copy-count"><strong>{creation.percent}%</strong><span>{creation.completed.toLocaleString()} / {creation.total.toLocaleString()}건</span></div>
      <progress aria-label="장부 복사 진행률" value={creation.percent} max={100}/>
      <p>기록이 많으면 시간이 걸릴 수 있어요. 앱을 다시 켜도 이어서 진행할 수 있어요.</p>
      {!busy&&<button className="primary-button" type="button" onClick={()=>void perform(()=>copy())}>이어서 진행</button>}
    </section>}
    {state?.ledger && <section className="sharing-card"><div className="sharing-ledger-heading"><h2>{state.ledger.name || '공유 장부'}</h2><span>{state.ledger.role==='owner'?'호스트':'게스트'}</span></div>
      {state.ledger.role==='owner'&&<form className="sharing-form-row" onSubmit={e=>{e.preventDefault();const value=new FormData(e.currentTarget).get('name');void perform(async()=>{await ledgerApi({action:'rename',ledgerId:state.ledger!.id,name:value});await refresh();});}}>
        <input name="name" aria-label="공유 장부 이름 변경" defaultValue={state.ledger.name} required/><button className="secondary-button" disabled={busy}>이름 변경</button></form>}
      <label className="sharing-id">장부 ID<input readOnly aria-label="장부 ID" value={state.ledger.id} onFocus={e => e.currentTarget.select()} /></label>
      <div className="sharing-members">{state.members.map(member => <div key={member.id}><span>{member.email || (member.id === state.user.id ? '나' : '참여자')}</span>
        <small>{member.role === 'owner' ? '호스트' : member.role === 'editor' ? '게스트' : '게스트 · 보기만'}</small>
        {state.ledger?.role === 'owner' && member.role !== 'owner' && <button type="button" disabled={busy} onClick={() => {
          if (window.confirm('이 참여자의 장부 접근을 해제할까요?')) void perform(async () => { await api({ action: 'remove', userId: member.id }); await refresh(); });
        }}>제거</button>}</div>)}</div>
    </section>}
    {state?.ledger?.role === 'owner' && <section className="sharing-card"><h2>초대</h2>
      <form onSubmit={e => { e.preventDefault(); void perform(async () => { const result = await api({ action: 'create', email, role }); setLink(result.link); await refresh(); }); }}>
        <label>Google 계정<input type="email" aria-label="초대할 Google 계정" autoComplete="off" placeholder="example@gmail.com" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <div className="sharing-form-row"><select aria-label="초대 권한" value={role} onChange={e => setRole(e.target.value)}><option value="editor">함께 기록</option><option value="viewer">보기만</option></select>
          <button className="primary-button" disabled={busy}>초대 만들기</button></div>
      </form>
      {link && <label>초대 링크<input readOnly aria-label="초대 링크" value={link} onFocus={e => e.currentTarget.select()} />
        <button type="button" className="secondary-button" onClick={() => void perform(async () => { await navigator.clipboard.writeText(link); setNotice('링크를 복사했어요.'); })}>링크 복사</button></label>}
      {state.invitations.filter(i => !i.revokedAt && !i.acceptedAt && i.expiresAt > Date.now()).map(i => <div className="sharing-invite-row" key={i.id}>
        <span>{i.email}<small>{i.role === 'editor' ? '함께 기록' : '보기만'} · {new Date(i.expiresAt).toLocaleDateString('ko-KR')}까지</small></span>
        <button type="button" disabled={busy} onClick={() => void perform(async () => { await api({ action: 'revoke', id: i.id }); setLink(''); await refresh(); })}>취소</button></div>)}
    </section>}
    {!state?.ledger && <section className="sharing-card"><h2>초대 수락</h2>
      <label>초대 링크<input aria-label="받은 초대 링크" autoComplete="off" value={inviteInput} onChange={e => { setInviteInput(e.target.value); setPreview(null); }} placeholder="링크 또는 초대 코드" /></label>
      {!preview ? <button type="button" className="primary-button" disabled={busy || !state || !invitationToken(inviteInput)} onClick={() => void perform(async () => {
        const result = await api({ action: 'preview', token: invitationToken(inviteInput) }); setPreview(result.ledger);
      })}>초대 확인</button> : <><div className="sharing-preview"><strong>{preview.name}</strong><span>{preview.role === 'editor' ? '함께 기록' : '보기만'}</span></div>
        <button type="button" className="primary-button" disabled={busy} onClick={() => void perform(async () => {
          const result=await api({ action: 'accept', token: invitationToken(inviteInput) }); clearInvitation(); if(result.ledgerId)selectCloudLedger(result.ledgerId); location.assign('/wallet#settings');
        })}>참여</button></>}
    </section>}
  </main>;
}
