import { walletContext, walletStorageKey } from './wallet-scope';

export type RecoveryInfo={state:{status:string;expires_at:number|null};generation:string;version:string;counts:Record<string,number>;records:{id:string;kind:string;created_at:number;expires_at:number;restored_at:number|null}[];serverTime:number};
export function hasPendingRecoveryWrites() {
  const pending=window.localStorage.getItem(walletStorageKey('mywallet:v2:pendingSyncAt'));
  const operations=JSON.parse(window.localStorage.getItem(walletStorageKey('mywallet:v2:pendingTransactionOperations'))||'[]');
  return Number(pending)>0||operations.length>0;
}
export async function recoveryRequest(body?:Record<string,unknown>):Promise<RecoveryInfo> {
  const scope=walletContext();if(!scope)throw Error('WALLET_UNAVAILABLE');
  const response=await window.fetch('/api/wallet/recovery',{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'X-Memoney-Ledger':scope.ledger.id,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const data=await response.json();if(!response.ok)throw Error(data.error||'RECOVERY_UNAVAILABLE');return data;
}
export async function staleArchiveDatabase() {
  return new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('memoney-recovery',1);request.onupgradeneeded=()=>request.result.createObjectStore('archives',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}
export async function readStaleArchives() {
  const db=await staleArchiveDatabase();
  try{return await new Promise<Record<string,unknown>[]>((resolve,reject)=>{const request=db.transaction('archives').objectStore('archives').getAll();request.onsuccess=()=>resolve(request.result.filter(record=>record.scope?.user.id===walletContext()?.user.id&&record.scope?.ledger.id===walletContext()?.ledger.id));request.onerror=()=>reject(request.error);});}
  finally{db.close();}
}
export async function preserveStalePending() {
  const values=Object.fromEntries(['mywallet:v2','mywallet:v2:pendingSyncAt','mywallet:v2:pendingTransactionOperations','mywallet:v2:generation'].map(key=>[key,window.localStorage.getItem(walletStorageKey(key))]));
  const record={id:crypto.randomUUID(),scope:walletContext(),createdAt:Date.now(),values};
  const db=await staleArchiveDatabase();
  try {
    await new Promise<void>((resolve,reject)=>{const transaction=db.transaction('archives','readwrite');transaction.objectStore('archives').add(record);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});
    // Only retire the old queue after its complete, scoped copy is committed.
    for(const key of ['mywallet:v2:pendingSyncAt','mywallet:v2:pendingTransactionOperations'])window.localStorage.removeItem(walletStorageKey(key));
    window.localStorage.removeItem(walletStorageKey('mywallet:v2'));
  }finally{db.close();}
  return record;
}
