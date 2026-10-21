import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { activeGuestId, guestKey, localSnapshot, localWalletFetch, persistLocalView } from '../src/auth/local-wallet.ts';
import { activateLocalWallet, walletFetch, walletStorageKey } from '../src/auth/wallet-scope.ts';
function storage() { const rows = new Map(); return { rows, getItem:k=>rows.get(k)??null, setItem:(k,v)=>rows.set(k,String(v)), removeItem:k=>rows.delete(k) }; }
const transaction = (id='t') => ({ id, type:'expense', date:'2026-10-13', time:'13:45', amount:100, title:'기기 기록 한글 ✓', category:'food', createdAt:42 });
function local() {
  const s=storage(), id=activeGuestId(s);
  return {s,id,read:()=>localSnapshot(s,id),write:body=>localWalletFetch(id,'/api/data',{method:'PATCH',body:JSON.stringify(body)},s)};
}
test('guest data is isolated, remains selected across launch and never contacts network data endpoints',async()=>{
  const s=storage();s.setItem('mywallet:v2',JSON.stringify({transactions:[{id:'legacy'}]}));
  let requests=0;globalThis.window={localStorage:s,fetch:()=>{requests++;throw Error('network forbidden');}};
  const id=activateLocalWallet();assert.equal(s.getItem('memoney:wallet-mode'),'local');
  assert.equal(walletStorageKey('mywallet:v2'),guestKey(id));
  assert.equal((await walletFetch('/api/data')).status,200);
  assert.equal((await walletFetch('/api/data',{method:'PATCH',body:JSON.stringify({op:'transaction.create',operationId:randomUUID(),transaction:transaction()})})).status,200);
  assert.equal((await (await walletFetch('/api/data')).json()).transactions[0].title,transaction().title);
  assert.equal(activateLocalWallet(),id);assert.equal(requests,0);
  await assert.rejects(walletFetch('/api/auth/session'),/LOCAL_ENDPOINT/);assert.equal(requests,0);
  assert.equal(JSON.parse(s.getItem('mywallet:v2')).transactions[0].id,'legacy');delete globalThis.window;
});
test('local create, restart, edit, conflict, delete and uncertain retry retain UTF-8 and revisions',async()=>{
  const f=local(), id=randomUUID(), create={op:'transaction.create',operationId:id,transaction:transaction()};
  assert.equal((await f.write(create)).status,200);assert.equal((await f.write(create)).status,200);
  assert.equal(f.read().transactions.length,1);assert.equal(f.read().transactions[0].time,'13:45');
  const update={op:'transaction.update',operationId:randomUUID(),expectedRevision:1,transaction:{...transaction(),amount:200}};
  assert.equal((await f.write(update)).status,200);assert.equal((await f.write(update)).status,200);assert.equal(f.read().transactions[0].revision,2);
  assert.equal((await f.write({...update,operationId:randomUUID()})).status,409);
  assert.equal((await f.write({...create,transaction:{...transaction(),amount:500}})).status,409);
  assert.equal((await f.write({op:'transaction.delete',operationId:randomUUID(),transactionId:'t',expectedRevision:2})).status,200);
  assert.equal(f.read().transactions.length,0);
});
test('quota failure cannot acknowledge or partially commit a transaction and corrupt data fails closed',async()=>{
  const f=local();await f.write({op:'transaction.create',operationId:randomUUID(),transaction:transaction()});
  const before=f.s.getItem(guestKey(f.id));f.s.setItem=()=>{throw Error('QuotaExceededError');};
  await assert.rejects(f.write({op:'transaction.update',operationId:randomUUID(),expectedRevision:1,transaction:{...transaction(),amount:500}}),/LOCAL_STORAGE_FAILED/);
  assert.equal(f.s.getItem(guestKey(f.id)),before);
  f.s.rows.set(guestKey(f.id),'broken JSON');assert.throws(f.read);
});
test('assets, ordering, custom categories, plans and settings survive local view persistence',async()=>{
  const f=local();
  await f.write({op:'category.create',type:'expense',id:'custom',label:'데이트',color:'#aa1234'});
  await f.write({op:'plan.upsert',category:'custom',type:'expense',plannedAmount:500});
  await f.write({op:'asset.create',asset:{id:'bank',category:'bank',name:'계좌',memo:'기기',amount:0},openingTransaction:{...transaction('opening'),type:'income',assetId:'bank',category:'opening-balance'}});
  assert.equal((await f.write({op:'asset.reorder',operationId:randomUUID(),categoryId:'bank',assetIds:['bank'],expectedRevision:0})).status,200);
  await f.write({op:'setting.set',key:'budget',value:1234});
  const data=f.read();persistLocalView(f.id,{transactions:data.transactions,assets:data.assets},f.s);
  assert.equal(f.read().budget,1234);assert.equal(f.read().assetOrderRevisions.bank,1);
  assert.equal(f.read().plans[0].plannedAmount,500);assert.equal(f.read().customExpenseCategories[0].label,'데이트');
});
test('recurrence stop and rule removal preserve historical rows and deleted occurrences',async()=>{
  const f=local(), rule={id:'r',type:'expense',day:31,time:'09:00',amount:100,title:'정기',category:'food',startMonth:'2026-02'};
  await f.write({op:'recurring_rule.create',rule});
  await f.write({op:'transaction.create',operationId:randomUUID(),transaction:{...transaction('rec_r_2026-02'),date:'2026-02-28',recurringRuleId:'r'}});
  await f.write({op:'recurring_rule.stop',id:'r',endMonth:'2026-03'});
  assert.equal(f.read().recurringRules[0].time,'09:00');assert.equal(f.read().recurringRules[0].endMonth,'2026-03');
  await f.write({op:'recurring_rule.delete',id:'r'});assert.equal(f.read().transactions.length,1);
  await f.write({op:'recurring_tx.delete',id:'rec_r_2026-02'});
  assert.deepEqual(f.read().deletedRecurringTxs,['rec_r_2026-02']);assert.equal(f.read().transactions.length,0);
});
test('card settlement commits transfer, sources and history together; a backup round trip preserves them',async()=>{
  const f=local();
  await f.write({op:'asset.create',asset:{id:'bank',category:'bank',name:'은행',memo:'',amount:0}});
  await f.write({op:'asset.create',asset:{id:'card',category:'card',name:'카드',memo:'',amount:0,cardPaymentAssetId:'bank'}});
  await f.write({op:'transaction.create',operationId:randomUUID(),transaction:{...transaction(),assetId:'card'}});
  const settle={op:'card.settle',operationId:randomUUID(),settlementId:'settlement',transactionId:'transfer',cardAssetId:'card',paymentAssetId:'bank',periodStart:'2026-10-01',periodEnd:'2026-10-31',dueDate:'2026-11-01',settledDate:'2026-10-13'};
  assert.equal((await f.write(settle)).status,200);assert.equal((await f.write(settle)).status,200);
  persistLocalView(f.id,{transactions:f.read().transactions,assets:f.read().assets},f.s);
  assert.equal(f.read().cardSettlements.length,1);assert.equal(f.read().transactions.find(t=>t.id==='t').revision,2);
  const restored=local();restored.s.setItem(guestKey(restored.id),JSON.stringify(f.read()));
  assert.deepEqual(restored.read(),f.read());
});
test('retired import journals do not lock local edits and remain preserved',async()=>{
  const f=local(), journal=JSON.stringify({version:1,completed:false});
  f.s.setItem(guestKey(f.id,'sync-job'),journal);
  assert.equal((await f.write({op:'transaction.create',operationId:randomUUID(),transaction:transaction()})).status,200);
  persistLocalView(f.id,{transactions:f.read().transactions},f.s);
  assert.equal(f.s.getItem(guestKey(f.id,'sync-job')),journal);
});
