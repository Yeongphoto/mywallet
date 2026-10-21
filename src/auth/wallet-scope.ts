import { activeGuestId, guestKey, localWalletFetch, MODE_KEY, pinGuestGeneration } from './local-wallet.ts';
import { completePersonalOnboarding } from './local-sync.ts';
export type WalletContext = { user: { id: string }; ledger: { id: string; role: 'owner' | 'editor' | 'viewer'; kind?: 'personal' | 'shared'; name?: string; generation?: string; recoveryStatus?: string; recoveryExpiresAt?: number }; mode: 'shared-web' | 'local' };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
let context: WalletContext | null = null;
let locked = false;
let financialWrites=0;
let maintenance=false;
export function beginWalletMaintenance() {
  if(financialWrites||maintenance)throw Error('PENDING_WRITES');
  maintenance=true;return ()=>{maintenance=false;};
}
export const SELECTED_LEDGER_KEY='memoney:selected-cloud-ledger:v1';
export function selectCloudLedger(id:string) { if(uuid.test(id))window.localStorage.setItem(SELECTED_LEDGER_KEY,id); }
export class WalletContextError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export function isWalletAccessDenied(error: unknown) {
  return error instanceof WalletContextError && [401, 403].includes(error.status);
}

export async function readWalletContext(): Promise<WalletContext> {
  const selected=window.localStorage.getItem(SELECTED_LEDGER_KEY);
  const get=(id:string|null)=>window.fetch('/api/wallet/context', { credentials: 'same-origin', cache: 'no-store',
    headers:id?{'X-Memoney-Ledger':id}:{},redirect: 'error', signal: AbortSignal.timeout(10000) });
  let response=await get(selected);
  if(response.status===425 && (await response.clone().json().catch(()=>({}))).error==='PERSONAL_ONBOARDING_REQUIRED'){
    const result=await completePersonalOnboarding();
    response=await get(result.ledger.id);
  }
  if(response.status===403&&selected){window.localStorage.removeItem(SELECTED_LEDGER_KEY);response=await get(null);}
  let data;
  try { data = await response.json(); }
  catch { throw new WalletContextError('WALLET_UNAVAILABLE', response.status); }
  if (!response.ok) throw new WalletContextError(data?.error || 'WALLET_UNAVAILABLE', response.status);
  if (!uuid.test(data.user?.id) || !uuid.test(data.ledger?.id) ||
      !['owner', 'editor', 'viewer'].includes(data.ledger?.role) || data.mode !== 'shared-web') throw new Error('WALLET_UNAVAILABLE');
  selectCloudLedger(data.ledger.id);
  return data;
}
export function activateWalletScope(next: WalletContext) { context = next; locked = false; }
export function activateLocalWallet() {
  const id = activeGuestId();
  pinGuestGeneration(id);
  activateWalletScope({ user: { id }, ledger: { id, role: 'owner' }, mode: 'local' });
  window.localStorage.setItem(MODE_KEY, 'local');
  return id;
}
export function isLocalWallet() { return context?.mode === 'local'; }
export function lockWalletScope() { locked = true; }
export function walletContext() { return context; }
export function walletStorageKey(key: string) {
  if (context?.mode === 'local') return guestKey(context.ledger.id, key);
  return context ? `memoney:user:${context.user.id}:ledger:${context.ledger.id}:${key}` : key;
}
export async function walletFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (context && locked) throw new Error('WALLET_LOCKED');
  if (context?.mode === 'local') return localWalletFetch(context.ledger.id, input, init);
  const headers=new Headers(init?.headers || (input instanceof Request?input.headers:undefined));
  if(context)headers.set('X-Memoney-Ledger',context.ledger.id);
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,'https://memoney.invalid');
  const path=url.pathname;
  const method=(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
  const writing=path==='/api/data'&&method!=='GET';
  if(writing&&maintenance)throw Error('WALLET_MAINTENANCE');
  if(context?.ledger.generation) {
    headers.set('X-Memoney-Generation',context.ledger.generation);
    if(path==='/api/data' && method==='PATCH') {
      const previous=window.localStorage.getItem(walletStorageKey('mywallet:v2:generation'))||'initial';
      if(previous!==context.ledger.generation)throw new Error('LEDGER_GENERATION_CHANGED');
    }
  }
  let response:Response;
  if(writing)financialWrites++;
  try {response=await window.fetch(input, {...init,headers});}
  finally {if(writing)financialWrites--;}
  if(context && path==='/api/data' && method==='GET' && response.ok && !url.searchParams.has('after')) {
    const generation=response.headers.get('X-Memoney-Generation');
    if(generation) {
      const previous=window.localStorage.getItem(walletStorageKey('mywallet:v2:generation'))||'initial';
      const operations=JSON.parse(window.localStorage.getItem(walletStorageKey('mywallet:v2:pendingTransactionOperations'))||'[]');
      const pending=Number(window.localStorage.getItem(walletStorageKey('mywallet:v2:pendingSyncAt')))>0||operations.length>0;
      if(generation!==previous&&pending) {
        window.dispatchEvent(new Event('memoney:wallet-generation-changed'));
        throw new Error('LEDGER_GENERATION_CHANGED');
      }
      // A mounted App must reload before adopting another generation's snapshot/cursor.
      if(context.ledger.generation&&context.ledger.generation!==generation) {
        window.dispatchEvent(new Event('memoney:wallet-generation-changed'));
        throw new Error('LEDGER_GENERATION_CHANGED');
      }
      if(generation!=='initial') {
        try {window.localStorage.setItem(walletStorageKey('mywallet:v2:generation'),generation);}
        catch {window.dispatchEvent(new Event('memoney:wallet-generation-changed'));throw new Error('GENERATION_STORAGE_UNAVAILABLE');}
      }
      context.ledger.generation=generation;
    }
  }
  if(context && (response.status===423 || response.status===409 && (await response.clone().json().catch(()=>({}))).error==='LEDGER_GENERATION_CHANGED')) {
    window.dispatchEvent(new Event('memoney:wallet-generation-changed'));
  }
  if (context && [401, 403].includes(response.status)) {
    locked = true;
    window.dispatchEvent(new Event('memoney:wallet-access-lost'));
  }
  return response;
}
