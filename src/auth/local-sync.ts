import { GUEST_ID_KEY, localSnapshot, guestGeneration, assertGuestGeneration, withGuestLock } from './local-wallet.ts';

type Onboarding = {status:'pending'|'waiting'|'complete';outcome?:string;ledger:{id:string;kind:'personal'};expiresAt?:number};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
async function api(requestFetch:typeof fetch,body?:unknown,ledgerId?:string):Promise<Onboarding> {
 const response=await requestFetch('/api/wallet/onboarding',{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000),
  headers:body===undefined?{}:{'Content-Type':'application/json','X-Memoney-Ledger':ledgerId!},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json();
 if(!response.ok)throw Error(data.error||'PERSONAL_ONBOARDING_UNAVAILABLE');
 if(!['pending','waiting','complete'].includes(data.status)||data.ledger?.kind!=='personal'||!uuid.test(data.ledger.id))throw Error('PERSONAL_ONBOARDING_UNAVAILABLE');
 return data;
}
// No local "already imported" flag and no per-row /api/data merge. The server decides once per account.
export async function completePersonalOnboarding(requestFetch:typeof fetch=window.fetch.bind(window),storage=window.localStorage) {
 let status=await api(requestFetch);
 if(status.status==='waiting')throw Error('PERSONAL_ONBOARDING_WAITING');
 if(status.status==='pending') {
  const id=storage.getItem(GUEST_ID_KEY);
  let snapshot=null;
  if(id){
   if(!uuid.test(id))throw Error('LOCAL_STORAGE_INVALID');
   // Snapshot only the active device ledger, including its recovery generation. Do not retire or alter it.
   snapshot=await withGuestLock(id,()=>{
    assertGuestGeneration(id,storage);
    const generation=guestGeneration(id,storage);
    const key=`memoney:guest:${id}:mywallet:v2`+(generation==='initial'?'':`:generation:${generation}`);
    // Do not repin a mounted local App to a new generation while taking its source snapshot.
    return localSnapshot({getItem:()=>storage.getItem(key)},id);
   });
  }
  const target=status.ledger.id;
  status=await api(requestFetch,{snapshot},target);
  if(status.ledger.id!==target)throw Error('SYNC_ACCOUNT_CHANGED');
  if(status.status!=='complete')throw Error('PERSONAL_ONBOARDING_WAITING');
 }
 storage.setItem('memoney:selected-cloud-ledger:v1',status.ledger.id);
 return status;
}
export async function preparePersonalLogin(requestFetch:typeof fetch=window.fetch.bind(window),storage=window.localStorage) {
 const response=await requestFetch('/api/auth/config',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('AUTH_UNAVAILABLE');
 const configuration=await response.json();
 if(configuration.personalOnboarding===true)return completePersonalOnboarding(requestFetch,storage);
 return null; // Feature off: preserve login compatibility, but never restore the retired merge flow.
}
