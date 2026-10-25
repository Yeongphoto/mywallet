import { useEffect, useState } from 'react';
import { useAppAppearance } from './use-app-appearance';
import { useLaunchReady } from './use-launch-ready';
import './account-management.css';

type Grant={userId:string;email:string|null;active:number;updatedAt:number};
const messages:Record<string,string>={ADMIN_REQUIRED:'슈퍼 관리자만 계정을 관리할 수 있어요.',UNAUTHENTICATED:'Google 로그인이 필요해요.',
  ACCOUNT_MANAGEMENT_NOT_CONFIGURED:'계정 관리 서버를 준비 중이에요.',ACCOUNT_NOT_FOUND:'앱에 로그인한 계정을 찾지 못했어요. 먼저 Google 로그인을 해 주세요.',
  INVALID_EMAIL:'Google 로그인 이메일을 확인해 주세요.',ACCOUNT_AMBIGUOUS:'이 이메일에 여러 계정이 연결되어 있어요. 계정을 확인해 주세요.',ADMIN_GRANT_PROTECTED:'슈퍼 관리자 자격은 여기서 변경할 수 없어요.'};
async function api(body?:unknown){const response=await fetch('/api/account/manage',{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000),
  ...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok)throw Error(data.error||'UNAVAILABLE');return data;}

export default function AccountManagement(){
  useAppAppearance();useLaunchReady(true);
  const [grants,setGrants]=useState<Grant[]|null>(null),[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState<string|null>(null);
  const showError=(cause:unknown)=>setError(messages[(cause as Error).message]||'연결을 확인한 뒤 다시 시도해 주세요.');
  useEffect(()=>{let alive=true;void api().then(data=>{if(alive)setGrants(data.grants);}).catch(cause=>{if(alive)showError(cause);});return()=>{alive=false;};},[]);
  async function change(body:unknown){if(busy)return;setBusy(true);setError('');setNotice('');try{await api(body);setGrants((await api()).grants);setEmail('');setPending(null);setNotice('회원 목록을 반영했어요.');}
    catch(cause){if(['ADMIN_REQUIRED','UNAUTHENTICATED'].includes((cause as Error).message))setGrants(null);showError(cause);}finally{setBusy(false);}}
  const back=new URLSearchParams(location.search).get('return')==='local'?'/guest#settings':'/wallet#settings';
  return <main className="account-management"><header><a className="secondary-button" href={back}>설정으로 돌아가기</a><h1>계정 관리</h1></header>
    <p>{grants!==null?'슈퍼 관리자 · 내부 테스터 프리미엄':'회원 혜택 관리'}</p>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {grants===null&&!error&&<p role="status">권한과 목록을 확인하고 있어요…</p>}
    {grants!==null&&<><form onSubmit={event=>{event.preventDefault();void change({action:'grant',email});}}>
      <label htmlFor="tester-email">Google 로그인 이메일</label><div><input id="tester-email" type="email" autoComplete="off" required maxLength={254} value={email} onChange={event=>setEmail(event.target.value)} disabled={busy}/><button type="submit" className="primary-button" disabled={busy}>추가</button></div>
      <small>앱에 로그인한 계정에 프리미엄을 부여합니다. 결제나 장부 권한은 변경하지 않습니다.</small></form>
      <section aria-label="테스터 프리미엄 목록">{grants.length===0&&<p>등록된 테스터가 없어요.</p>}{grants.map(grant=><article key={grant.userId}>
        <div><strong>{grant.email||'이메일 확인 필요'}</strong><span>{grant.active===1?'프리미엄 회원 · 내부 테스터':'테스터 혜택 해제됨'}</span></div>
        {grant.active===1?<button type="button" className="secondary-button" disabled={busy} onClick={()=>setPending(grant.userId)}>해제</button>
          :<button type="button" className="secondary-button" disabled={busy||!grant.email} onClick={()=>void change({action:'grant',email:grant.email})}>다시 부여</button>}
        {pending===grant.userId&&<div className="account-management-confirm" role="group" aria-label="테스터 혜택 해제 확인"><span>테스터 프리미엄 혜택을 해제할까요?</span><button type="button" className="secondary-button" disabled={busy} onClick={()=>void change({action:'revoke',userId:grant.userId})}>해제 확인</button><button type="button" className="secondary-button" disabled={busy} onClick={()=>setPending(null)}>취소</button></div>}
      </article>)}</section></>}
    {busy&&<p role="status">반영 중…</p>}
  </main>;
}
