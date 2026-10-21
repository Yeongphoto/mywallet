import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost } from '../functions/api/data.ts';
import { sharedWalletConfiguration } from '../server/wallet/shared-web.ts';
import { androidDataConnection } from '../server/wallet/android-data.ts';

// Per-user WEB_FINANCE provisioning is retired. The full signed-session,
// shared membership, cross-client save and restore cases live in
// ledger-recovery.test.mjs and shared-creation.test.mjs using three SQLite DBs.
const ledger='11111111-1111-4111-8111-111111111111';
const env={AUTH_ENABLED:'true',AUTH_ANDROID_DATA_COMPAT:'true',AUTH_TEST_PERSONAL_LEDGER:'true',AUTH_TEST_MULTI_LEDGER:'true',
 AUTH_SHARED_WALLET_LEDGER_ID:ledger,AUTH_ORIGIN:'https://mywallet-8mx.pages.dev',TEST_FINANCE:{},TEST_SHARED_FINANCE:{}};
test('canonical web configuration reuses the Android ledger and rejects the retired separate web mode',()=>{
 assert.equal(sharedWalletConfiguration(env).ledgerId,ledger);
 assert.equal(androidDataConnection({...env,AUTH_WEB_WALLETS:'true'}),false);
 assert.equal(androidDataConnection({...env,WEB_FINANCE:{}}),false);
 assert.equal(androidDataConnection({...env,AUTH_SHARED_WALLET_ORIGIN:'https://foreign.invalid'}),false);
 for(const patch of [{AUTH_ORIGIN:'https://foreign.invalid'},{TEST_FINANCE:undefined},{TEST_SHARED_FINANCE:undefined},{AUTH_ENABLED:'false'}])
  assert.equal(sharedWalletConfiguration({...env,...patch}),null);
});
test('common API explicitly permits only the isolated local web fixture origin',()=>{
 assert.equal(androidDataConnection({...env,AUTH_ORIGIN:'http://localhost:5189',AUTH_LOCAL_DEV:'true'}),true);
 assert.equal(androidDataConnection({...env,AUTH_ORIGIN:'http://localhost:5189'}),false);
 assert.equal(androidDataConnection({...env,AUTH_ORIGIN:'http://localhost:9999',AUTH_LOCAL_DEV:'true'}),false);
});
test('missing authentication cannot expose the legacy financial route or accept whole-state replacement',async()=>{
 let touched=false;
 const DB={prepare(){touched=true;throw Error('Unexpected database access');}};
 const request=new Request(env.AUTH_ORIGIN+'/api/data');
 assert.equal((await onRequestGet({request,env:{DB}})).status,503);
 assert.equal(touched,false);
 const post=new Request(env.AUTH_ORIGIN+'/api/data',{method:'POST',headers:{Origin:env.AUTH_ORIGIN,'Content-Type':'application/json'},body:'{}'});
 assert.equal((await onRequestPost({request:post,env:{...env,DB}})).status,405);
 assert.equal(touched,false);
});
