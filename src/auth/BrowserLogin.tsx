import {useEffect,useRef,useState} from 'react';
import type {User} from './auth-client';
import {useLaunchReady} from './use-launch-ready';
import {useAppAppearance} from './use-app-appearance';
import {BrandWordmark} from '../BrandWordmark';
import './signin.css';
import './browser-login.css';

type Flow={url:string;code:string;expiresAt:number};
async function api(action:string,body:unknown={}) {
  const r=await fetch('/api/auth/browser-'+action,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  const data=await r.json();if(!r.ok)throw Error(data.error||'AUTH_UNAVAILABLE');return data;
}
let starting:Promise<Flow>|null=null;
function start(){return starting??=(api('start') as Promise<Flow>);}
const messages:Record<string,string>={LOGIN_CHALLENGE_EXPIRED:'로그인 시간이 지났어요. 다시 시작해 주세요.',RATE_LIMITED:'잠시 후 다시 시도해 주세요.',INVALID_ID_TOKEN:'Google 계정을 확인하지 못했어요. 다시 선택해 주세요.',ACCOUNT_CONFIRMATION_REQUIRED:'연결할 계정을 다시 확인해 주세요.'};
const notice=(error:unknown)=>messages[error instanceof Error?error.message:'']||'로그인을 연결하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.';

export function BrowserLoginButton({onAuthenticated}:{onAuthenticated:(user:User)=>void}) {
  const [flow,setFlow]=useState<Flow|null>(null),[waiting,setWaiting]=useState(false),[email,setEmail]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{let active=true;void start().then(value=>{if(active)setFlow(value);}).catch(e=>{if(active)setError(notice(e));});return()=>{active=false;};},[revision]);
  useEffect(()=>{
    if(!waiting||!flow)return;let active=true,timer=0,inFlight=false;
    async function poll(){if(!active||inFlight)return;inFlight=true;try {
      if(Date.now()>=flow!.expiresAt)throw Error('LOGIN_CHALLENGE_EXPIRED');
      const data=await api('poll');if(!active)return;
      if(data.code!==flow!.code)throw Error('LOGIN_CHALLENGE_EXPIRED');
      if(data.approved){setEmail(data.email);setWaiting(false);return;}
    }catch(e){if(active){setError(notice(e));setWaiting(false);return;}}finally{inFlight=false;}
      if(active)timer=window.setTimeout(()=>void poll(),2000);
    }
    const resume=()=>{if(document.visibilityState==='visible'){window.clearTimeout(timer);void poll();}};
    void poll();document.addEventListener('visibilitychange',resume);return()=>{active=false;window.clearTimeout(timer);document.removeEventListener('visibilitychange',resume);};
  },[waiting,flow]);
  async function claim(){if(!flow||busy)return;setBusy(true);setError('');try {const data=await api('claim',{code:flow.code,email});const r=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});const session=await r.json();if(!r.ok||session.user?.id!==data.user?.id)throw Error('SESSION_NOT_SAVED');onAuthenticated(data.user);}catch(e){setError(notice(e));}finally{setBusy(false);}}
  return <div className="browser-login-controls">
    {email?<><p className="browser-account">{email}</p><button className="signin-google" disabled={busy} onClick={()=>void claim()}><img src="/google-g.png" alt="" />이 계정으로 계속하기</button></>:<a className="signin-google" role="button" aria-disabled={!flow} href={flow?.url} target="_blank" rel="noopener noreferrer" onClick={e=>{if(!flow){e.preventDefault();return;}setError('');setWaiting(true);}}><img src="/google-g.png" alt="" /><span>Google로 계속하기</span></a>}
    {flow&&(waiting||email)&&<p className="browser-login-code">연결 코드 <strong>{flow.code}</strong></p>}
    {waiting&&<div className="browser-login-help"><p>기본 브라우저에서 계정을 선택해 주세요. 두 화면의 연결 코드가 같은지 확인하세요.</p><button className="signin-local" onClick={()=>void navigator.clipboard.writeText(flow!.url).catch(()=>setError('로그인 링크를 복사하지 못했어요.'))}>로그인 링크 복사</button></div>}
    {error&&<><p role="alert">{error}</p><button className="signin-local" disabled={busy} onClick={()=>{starting=null;setFlow(null);setEmail('');setWaiting(false);setError('');setRevision(v=>v+1);}}>다시 시작</button></>}
  </div>;
}

type GoogleId={initialize:(options:{client_id:string;nonce:string;auto_select:boolean;callback:(value:{credential:string})=>void})=>void;renderButton:(element:HTMLElement,options:Record<string,unknown>)=>void};
let sdk:Promise<GoogleId>|null=null;
function googleSdk(){return sdk??=new Promise<GoogleId>((resolve,reject)=>{
  const current=()=>((window as unknown as {google?:{accounts?:{id?:GoogleId}}}).google?.accounts?.id);
  const present=current();if(present){resolve(present);return;}
  const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.referrerPolicy='strict-origin-when-cross-origin';script.onload=()=>{const id=current();if(id)resolve(id);else reject(Error('GOOGLE_UNAVAILABLE'));};script.onerror=()=>{sdk=null;reject(Error('GOOGLE_UNAVAILABLE'));};document.head.append(script);
});}
export default function BrowserApprovalScreen(){
  useAppAppearance();useLaunchReady(true);
  const approval=useRef(new URLSearchParams(window.location.hash.slice(1)).get('approve')||'');
  const [info,setInfo]=useState<{clientId:string;nonce:string;code:string;approved:boolean}|null>(null),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false),[complete,setComplete]=useState(false),[busy,setBusy]=useState(false);
  const button=useRef<HTMLDivElement>(null),approving=useRef(false);
  useEffect(()=>{history.replaceState(null,'','/browser-login');let active=true;void api('preview',{approval:approval.current}).then(value=>{if(active){setInfo(value);setComplete(value.approved);}}).catch(e=>{if(active)setError(notice(e));});return()=>{active=false;};},[]);
  useEffect(()=>{if(!info||!confirmed||complete)return;let active=true;
    void googleSdk().then(id=>{if(!active||!button.current)return;id.initialize({client_id:info.clientId,nonce:info.nonce,auto_select:false,callback:value=>{
      if(!active||approving.current)return;approving.current=true;setBusy(true);setError('');
      void api('approve',{approval:approval.current,code:info.code,idToken:value.credential}).then(()=>{if(active)setComplete(true);}).catch(e=>{if(active)setError(notice(e));}).finally(()=>{value.credential='';approving.current=false;if(active)setBusy(false);});
    }});id.renderButton(button.current,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'pill',width:300});}).catch(e=>{if(active)setError(notice(e));});
    return()=>{active=false;};
  },[info,confirmed,complete]);
  return <main className="memoney-signin mememo-signin browser-approval"><header className="signin-brand"><BrandWordmark /></header><section className="signin-content"><h1>{complete?'계정 확인 완료':'브라우저 로그인'}</h1>
    {complete?<p role="status">오르카로 돌아가 연결할 계정을 확인해 주세요. 이 창은 닫아도 됩니다.</p>:<>
      {info&&<><p className="browser-login-code">연결 코드 <strong>{info.code}</strong></p><label className="browser-code-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)} />오르카 화면과 연결 코드가 같아요</label><div ref={button} className="browser-google-slot" />{busy&&<p role="status">계정을 확인하고 있어요…</p>}</>}
    </>}{error&&<p role="alert">{error}</p>}</section></main>;
}
