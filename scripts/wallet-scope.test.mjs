import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { activateWalletScope, walletStorageKey, walletFetch, lockWalletScope, readWalletContext, isWalletAccessDenied } from '../src/auth/wallet-scope.ts';
import { preloadD1Cache } from '../src/d1-cache-preload.ts';
function scope(){return {user:{id:randomUUID()},ledger:{id:randomUUID(),role:'owner'},mode:'shared-web'};}
function browser(fetch){const values=new Map(),events=[];return {values,events,fetch,dispatchEvent:event=>events.push(event.type),
  localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}};}

test('context access denial is distinguished from transient network and server failures',async()=>{
  for(const status of [401,403,429,503]){
    globalThis.window=browser(async()=>Response.json({error:'UNAUTHENTICATED'},{status}));
    await assert.rejects(readWalletContext(),error=>isWalletAccessDenied(error)===[401,403].includes(status));
  }
  globalThis.window=browser(async()=>{throw new TypeError('Failed to fetch');});
  await assert.rejects(readWalletContext(),error=>!isWalletAccessDenied(error));
  globalThis.window=browser(async()=>new Response('not JSON',{status:401}));
  await assert.rejects(readWalletContext(),isWalletAccessDenied);
  delete globalThis.window;
});

test('legacy web keys are preserved and authenticated ledger caches never import global records',async()=>{
  assert.equal(walletStorageKey('mywallet:v2'),'mywallet:v2');
  const state=browser(async()=>Response.json({transactions:[{id:'remote'}],assets:[],updatedAt:42}));
  globalThis.window=state;
  state.values.set('mywallet:v2',JSON.stringify({transactions:[{id:'legacy'}]}));
  const a=scope();activateWalletScope(a);await preloadD1Cache();
  const keyA=walletStorageKey('mywallet:v2');
  assert.equal(JSON.parse(state.values.get(keyA)).transactions[0].id,'remote');
  assert.equal(JSON.parse(state.values.get('mywallet:v2')).transactions[0].id,'legacy');
  state.values.set(walletStorageKey('mywallet:v2:pendingSyncAt'),'123');
  activateWalletScope(scope());assert.notEqual(walletStorageKey('mywallet:v2'),keyA);
  assert.equal(state.values.get(keyA+':pendingSyncAt'),'123');
  delete globalThis.window;
});

test('pending ledger edits remain intact and a failed first load does not open an empty wallet',async()=>{
  let calls=0;const state=browser(async()=>{calls++;return Response.json({error:'WALLET_UPSTREAM_UNAVAILABLE'},{status:502});});
  globalThis.window=state;activateWalletScope(scope());
  const pending=walletStorageKey('mywallet:v2:pendingSyncAt');state.values.set(pending,'123');
  const cache=walletStorageKey('mywallet:v2');state.values.set(cache,'pending edits');
  await preloadD1Cache();assert.equal(calls,0);assert.equal(state.values.get(cache),'pending edits');
  state.values.delete(pending);await assert.rejects(preloadD1Cache(),/WALLET_UNAVAILABLE/);
  assert.equal(state.values.get(cache),'pending edits');delete globalThis.window;
});

test('row-operation recovery queues protect the ledger cache before replay',async()=>{
  let calls=0;const state=browser(async()=>{calls++;return Response.json({transactions:[]});});
  globalThis.window=state;activateWalletScope(scope());
  const cache=walletStorageKey('mywallet:v2');state.values.set(cache,'unsent row changes');
  state.values.set(walletStorageKey('mywallet:v2:pendingTransactionOperations'),JSON.stringify([{operationId:randomUUID(),status:'retry'}]));
  await preloadD1Cache();assert.equal(calls,0);assert.equal(state.values.get(cache),'unsent row changes');
  delete globalThis.window;
});

test('access loss locks further financial requests while retaining account pending data',async()=>{
  let calls=0;const state=browser(async()=>{calls++;return Response.json({error:'UNAUTHENTICATED'},{status:401});});
  globalThis.window=state;activateWalletScope(scope());
  state.values.set(walletStorageKey('mywallet:v2:pendingSyncAt'),'123');
  assert.equal((await walletFetch('/api/data')).status,401);assert.deepEqual(state.events,['memoney:wallet-access-lost']);
  await assert.rejects(walletFetch('/api/data'),/WALLET_LOCKED/);assert.equal(calls,1);
  lockWalletScope();assert.equal(state.values.get(walletStorageKey('mywallet:v2:pendingSyncAt')),'123');
  delete globalThis.window;
});
