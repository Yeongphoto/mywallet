import { activeGuestId, guestKey, localWalletFetch, MODE_KEY } from './local-wallet.ts';
export type WalletContext = { user: { id: string }; ledger: { id: string; role: 'owner' | 'editor' | 'viewer'; kind?: 'personal' | 'shared'; name?: string }; mode: 'shared-web' | 'local' };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
let context: WalletContext | null = null;
let locked = false;
export const SELECTED_LEDGER_KEY='memoney:selected-cloud-ledger:v1';
export function selectCloudLedger(id:string) { if(uuid.test(id))window.localStorage.setItem(SELECTED_LEDGER_KEY,id); }

export async function readWalletContext(): Promise<WalletContext> {
  const selected=window.localStorage.getItem(SELECTED_LEDGER_KEY);
  const get=(id:string|null)=>window.fetch('/api/wallet/context', { credentials: 'same-origin', cache: 'no-store',
    headers:id?{'X-Memoney-Ledger':id}:{},redirect: 'error', signal: AbortSignal.timeout(10000) });
  let response=await get(selected);
  if(response.status===403&&selected){window.localStorage.removeItem(SELECTED_LEDGER_KEY);response=await get(null);}
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'WALLET_UNAVAILABLE');
  if (!uuid.test(data.user?.id) || !uuid.test(data.ledger?.id) ||
      !['owner', 'editor', 'viewer'].includes(data.ledger?.role) || data.mode !== 'shared-web') throw new Error('WALLET_UNAVAILABLE');
  selectCloudLedger(data.ledger.id);
  return data;
}
export function activateWalletScope(next: WalletContext) { context = next; locked = false; }
export function activateLocalWallet() {
  const id = activeGuestId();
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
  const response = await window.fetch(input, {...init,headers});
  if (context && [401, 403].includes(response.status)) {
    locked = true;
    window.dispatchEvent(new Event('memoney:wallet-access-lost'));
  }
  return response;
}
