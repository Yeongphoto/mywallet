import { useEffect, useRef, useState } from 'react';
import { hasPendingRecoveryWrites, recoveryRequest, readStaleArchives } from './recovery-client';
import { saveGuestBackup } from './local-backup';
import { localRecoveryAction, localRecoveryInfo } from './local-recovery';
import type { RecoveryInfo } from './recovery-client';
import { walletContext, beginWalletMaintenance } from './wallet-scope';
import './recovery.css';

const messages:Record<string,string>={
  REAUTH_REQUIRED:'안전을 위해 Google 계정을 다시 확인해 주세요.',
  RECOVERY_CHANGED:'다른 기기에서 장부가 변경됐어요. 최신 상태를 확인한 뒤 다시 시도해 주세요.',
  RECOVERY_CHANGED_OR_UNAVAILABLE:'장부가 변경됐거나 보관을 완료하지 못했어요. 원본은 그대로 유지됩니다. 다시 확인해 주세요.',
  RECOVERY_EXPIRED:'복구 기간이 지났거나 이미 복구한 기록이에요.',
  RECOVERY_TOO_LARGE:'안전하게 보관할 수 있는 용량을 초과했어요. 초기화하지 않았습니다.',
  RECOVERY_CORRUPTED:'보관본 검증에 실패했어요. 현재 장부는 변경하지 않았습니다.',
  LOCAL_RECOVERY_UNSUPPORTED:'이 환경에서는 안전한 기기 내 복구를 지원하지 않아요. 파일 백업을 이용해 주세요.',
  RECOVERY_STORAGE_FULL:'기기 저장 공간이 부족해 초기화하지 않았어요. 현재 기록은 그대로 유지됩니다.',
};
const date=(value:number)=>new Date(value).toLocaleString('ko-KR',{dateStyle:'medium',timeStyle:'short'});
export function LedgerRecovery({standalone=false,onManageShared}:{standalone?:boolean;onManageShared?:()=>void}) {
  const scope=walletContext();
  const [info,setInfo]=useState<RecoveryInfo|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState<{action:string;recoveryId?:string}|null>(null);
  const operation=useRef<{key:string;id:string}|null>(null);
  const [code,setCode]=useState('');
  const [staleCount,setStaleCount]=useState(0);
  const owner=scope?.ledger.role==='owner',shared=scope?.ledger.kind==='shared';
  const local=scope?.mode==='local';
  const load=()=>local?localRecoveryInfo(scope!.ledger.id):recoveryRequest();
  useEffect(()=>{let active=true;if(owner)void load().then(data=>{if(active)setInfo(data);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[owner,local]);
  useEffect(()=>{void readStaleArchives().then(records=>setStaleCount(records.length)).catch(()=>{});},[]);
  async function run() {
    if(!confirm||!info||busy||code!==(confirm.action==='restore'?'복구':shared?'보관':'초기화'))return;
    setBusy(true);setError('');
    let release:(()=>void)|undefined,completed=false;
    try {
      if(!local)release=beginWalletMaintenance();
      if(!local&&hasPendingRecoveryWrites())throw Error('PENDING_WRITES');
      const key=JSON.stringify(confirm);
      if(operation.current?.key!==key)operation.current={key,id:crypto.randomUUID()};
      const body={...confirm,generation:info.generation,version:info.version,operationId:operation.current.id};
      if(local)await localRecoveryAction(scope!.ledger.id,body);else await recoveryRequest(body);
      completed=true;
      window.location.reload();
    }catch(e){const value=e instanceof DOMException&&e.name==='QuotaExceededError'?'RECOVERY_STORAGE_FULL':e instanceof Error?e.message:'RECOVERY_UNAVAILABLE';setError(value);if(value==='RECOVERY_CHANGED'||value==='RECOVERY_CHANGED_OR_UNAVAILABLE') {operation.current=null;setConfirm(null);void load().then(setInfo).catch(()=>{});}}
    finally{if(!completed)release?.();setBusy(false);}
  }
  function ask(action:string,recoveryId?:string){setCode('');setConfirm({action,recoveryId});setError('');operation.current=null;}
  const previousChanges=staleCount>0?<button className="secondary-button" onClick={()=>void readStaleArchives().then(records=>saveGuestBackup(JSON.stringify({format:'memoney-previous-generation',records}),`memoney-previous-changes-${Date.now()}.json`)).catch(()=>setError('BACKUP_FAILED'))}>이전 변경 보관본 내보내기 ({staleCount})</button>:null;
  const manage=onManageShared?<button type="button" className="secondary-button" aria-label="공유 장부 관리" disabled={busy} onClick={onManageShared}>관리</button>:null;
  if(!owner)return standalone?<section className="ledger-recovery"><h2>공유 장부가 보관 중이에요</h2><p>호스트가 복구하면 다시 사용할 수 있어요.</p><a className="secondary-button" href="/guest#settings">다른 장부 선택</a></section>:previousChanges||manage?<article className="settings-data-card ledger-recovery">{manage&&<><strong>공유 장부</strong><div className="settings-card-actions">{manage}</div></>}{previousChanges}{error&&<p role="alert">이전 변경을 내보내지 못했어요.</p>}</article>:null;
  if(error==='RECOVERY_NOT_CONFIGURED')return manage?<article className="settings-data-card ledger-recovery"><strong>공유 장부</strong><div className="settings-card-actions">{manage}</div></article>:null;
  return <article className="settings-data-card ledger-recovery" aria-busy={busy||(!info&&!error)}>
    <strong>{info?.state.status==='archived'?'보관 중인 공유 장부':info?.state.status==='expired'?'보관 기간이 지난 장부':'장부 보관 및 복구'}</strong>
    {local&&<p>이 기기에 7일 동안 보관합니다. 앱·사이트 데이터를 지우면 복구할 수 없으니 파일 백업도 남겨 주세요.</p>}
    {(!info||info.state.status==='active')&&<><p>{shared?'모든 멤버의 이용이 중단됩니다. 7일 안에 복구하지 않으면 장부 데이터가 삭제됩니다.':'초기화 전 기록은 7일 동안 보관됩니다.'}</p><div className="settings-card-actions">{manage}<button className="secondary-button" disabled={busy||!info} onClick={()=>ask(shared?'archive':'reset')}>{shared?'공유 장부 삭제 예약':local?'로컬 장부 초기화':'개인 장부 초기화'}</button></div></>}
    {!info&&!error&&<p role="status">복구 상태를 확인하고 있어요.</p>}
    {info&&info.state.status!=='active'&&manage&&<div className="settings-card-actions">{manage}</div>}
    {info&&<>
      {info.state.status==='archived'&&<p>복구 가능 기한: {date(info.state.expires_at!)}</p>}
      {info.state.status==='expired'&&<p>7일의 복구 기간이 지났어요.</p>}
      {info.records.filter(r=>!r.restored_at).map(record=><div className="recovery-record" key={record.id}><div><strong>{record.kind==='before-restore'?'복구 직전 기록':record.kind==='archive'?'공유 장부 보관':'초기화 전 기록'}</strong><small>{date(record.created_at)} · {date(record.expires_at)}까지</small></div><button className="secondary-button" disabled={busy} onClick={()=>ask('restore',record.id)}>복구</button></div>)}
    </>}
    {confirm&&<div className="recovery-confirm" role="group" aria-label="장부 변경 확인">
      <p>{confirm.action==='restore'?'이 기록으로 복구합니다. 현재 기록도 먼저 7일간 별도 보관합니다.':shared?'장부를 보관하고 모든 멤버의 이용을 중단합니다. 7일이 지나면 장부 데이터가 삭제됩니다.':'장부를 비웁니다. 거래·자산·계획·카테고리·정기기록을 함께 보관합니다.'}</p>
      <label>계속하려면 ‘{confirm.action==='restore'?'복구':shared?'보관':'초기화'}’를 입력하세요.<input value={code} disabled={busy} onChange={e=>setCode(e.target.value)} autoComplete="off" /></label>
      <div className="settings-card-actions"><button className="secondary-button" disabled={busy} onClick={()=>setConfirm(null)}>취소</button><button className="primary-button" disabled={busy||code!==(confirm.action==='restore'?'복구':shared?'보관':'초기화')} onClick={()=>void run()}>{busy?'안전하게 처리 중…':'확인'}</button></div>
    </div>}
    {error&&<p role="alert">{error==='PENDING_WRITES'?'저장 대기 중인 변경이 있어요. 먼저 서버 확인으로 저장을 완료해 주세요.':messages[error]||'복구 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'}</p>}
    {error==='REAUTH_REQUIRED'&&<a className="secondary-button" href="/signin?reauth=1&wallet=shared">Google 계정 다시 확인</a>}
    {previousChanges}
    {standalone&&<a className="secondary-button" href="/guest#settings">다른 장부 선택</a>}
  </article>;
}
