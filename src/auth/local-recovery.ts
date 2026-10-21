import { assertGuestGeneration, guestGeneration, localSnapshot, withGuestLock } from './local-wallet';
import { staleArchiveDatabase } from './recovery-client';
import type { RecoveryInfo } from './recovery-client';
const retention=7*24*60*60*1000;
type Archive={id:string;localLedger:string;kind:string;created_at:number;expires_at:number;restored_at:number|null;snapshot:string;hash:string;generation:string;resultGeneration:string;committed:boolean;recoveryId?:string};
async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
async function records(db:IDBDatabase){return new Promise<Archive[]>((resolve,reject)=>{const r=db.transaction('archives').objectStore('archives').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function put(db:IDBDatabase,record:Archive){return new Promise<void>((resolve,reject)=>{const tx=db.transaction('archives','readwrite');tx.objectStore('archives').put(record);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});}
export async function localRecoveryInfo(id:string):Promise<RecoveryInfo> {
  if(!navigator.locks||!window.indexedDB)throw Error('LOCAL_RECOVERY_UNSUPPORTED');
  assertGuestGeneration(id);
  const db=await staleArchiveDatabase();
  try {
    const all=await records(db),generation=guestGeneration(id),now=Date.now();
    const active=[];
    for(const record of all.filter(r=>r.localLedger===id)) {
      if(record.expires_at<=now) {
        if(record.generation!==generation)window.localStorage.removeItem(`memoney:guest:${id}:mywallet:v2`+(record.generation!=='initial'?`:generation:${record.generation}`:''));
        await new Promise<void>((resolve,reject)=>{const tx=db.transaction('archives','readwrite');tx.objectStore('archives').delete(record.id);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});
        continue;
      }
      if(!record.committed&&record.resultGeneration===generation){record.committed=true;await put(db,record);}
      if(record.committed&&record.recoveryId){const source=all.find(r=>r.id===record.recoveryId);if(source&&!source.restored_at){source.restored_at=record.created_at;await put(db,source);}}
      if(record.committed)active.push(record);
    }
    const snapshot=JSON.stringify(localSnapshot(window.localStorage,id));
    return {state:{status:'active',expires_at:null},generation,version:await hash(snapshot),counts:Object.fromEntries(Object.entries(JSON.parse(snapshot)).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,(v as unknown[]).length])),records:active.sort((a,b)=>b.created_at-a.created_at),serverTime:now};
  }finally{db.close();}
}
export async function localRecoveryAction(id:string,body:Record<string,unknown>) {
  if(!navigator.locks)throw Error('LOCAL_RECOVERY_UNSUPPORTED');
  return withGuestLock(id,async()=>{
    assertGuestGeneration(id);
    const snapshot=JSON.stringify(localSnapshot(window.localStorage,id)),generation=guestGeneration(id),now=Date.now();
    const db=await staleArchiveDatabase();
    try {
      const all=await records(db),existing=all.find(r=>r.id===body.operationId);
      if(existing?.committed)return;
      if(body.generation!==generation||body.version!==await hash(snapshot))throw Error('RECOVERY_CHANGED');
      const target=body.action==='restore'?all.find(r=>r.id===body.recoveryId&&r.localLedger===id&&r.committed):null;
      if(body.action==='restore'&&(!target||target.expires_at<=now||target.restored_at))throw Error('RECOVERY_EXPIRED');
      if(target&&await hash(target.snapshot)!==target.hash)throw Error('RECOVERY_CORRUPTED');
      const next=crypto.randomUUID(),record:Archive={id:String(body.operationId),localLedger:id,kind:target?'before-restore':'reset',created_at:now,expires_at:now+retention,restored_at:null,snapshot,hash:await hash(snapshot),generation,resultGeneration:next,committed:false,recoveryId:target?.id};
      // Commit and re-read the complete IndexedDB copy before touching the active pointer.
      await put(db,record);
      const checked=(await records(db)).find(r=>r.id===record.id);
      if(!checked||await hash(checked.snapshot)!==record.hash)throw Error('RECOVERY_CORRUPTED');
      assertGuestGeneration(id);
      if(JSON.stringify(localSnapshot(window.localStorage,id))!==snapshot)throw Error('RECOVERY_CHANGED');
      const nextSnapshot=target?localSnapshot({getItem:()=>target.snapshot},id):localSnapshot({getItem:()=>null},id);
      nextSnapshot.updatedAt=Date.now();
      const key=`memoney:guest:${id}:mywallet:v2:generation:${next}`;
      window.localStorage.setItem(key,JSON.stringify(nextSnapshot));
      // This one atomic pointer write activates the new generation. Older app code
      // can only write its old storage key, never the new active ledger.
      window.localStorage.setItem(`memoney:guest:${id}:recovery-generation`,next);
      record.committed=true;
      try {await put(db,record);if(target){target.restored_at=Date.now();await put(db,target);}}catch{/* The committed pointer lets the next read repair the completion marker. */}
    }finally{db.close();}
  });
}
