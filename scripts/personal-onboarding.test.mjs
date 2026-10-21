import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createSession,resolveUser,revokeSession} from '../server/auth/store.ts';
import {handleAuth} from '../server/auth/http.ts';
import {handlePersonalOnboarding,ensurePersonalLedger,personalFinance} from '../server/wallet/personal.ts';
import {sharedWalletContext,sharedWalletData} from '../server/wallet/shared-web.ts';
import {handleRecovery} from '../server/wallet/recovery.ts';
import {handleLedgers} from '../server/wallet/shared-creation.ts';
import {scopedFinance} from '../server/wallet/scoped-finance.ts';
import {localSnapshot,GUEST_ID_KEY,guestKey,localWalletFetch,pinGuestGeneration,assertGuestGeneration} from '../src/auth/local-wallet.ts';
import {completePersonalOnboarding} from '../src/auth/local-sync.ts';
import {readWalletContext} from '../src/auth/wallet-scope.ts';
import {onRequestGet,onRequestPatch} from '../functions/api/data.ts';

function adapter(sqlite){
 const db={fail:null,before:null,lastError:null,prepare(sql){return {sql,values:[],bind(...values){this.values=values;return this;},
  async first(){return sqlite.prepare(sql).get(...this.values)||null;},async all(){return {results:sqlite.prepare(sql).all(...this.values)};},
  async run(){return {meta:{changes:sqlite.prepare(sql).run(...this.values).changes}};}};},
  async batch(items){
   if(db.before)await db.before(items);
   sqlite.exec('BEGIN');try{const result=items.map(s=>{if(db.fail?.(s.sql))throw Error('Injected transactional failure');const q=sqlite.prepare(s.sql);return q.columns().length?{results:q.all(...s.values),meta:{changes:0}}:{meta:{changes:q.run(...s.values).changes}};});sqlite.exec('COMMIT');return result;}
   catch(error){sqlite.exec('ROLLBACK');db.lastError=error;throw error;}
  }};return db;
}
function storage(){const rows=new Map();return {rows,getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,String(v)),removeItem:k=>rows.delete(k)};}
function snapshot(id='local-tx'){
 const data=localSnapshot(storage(),randomUUID());
 Object.assign(data,{assets:[{id:'bank',category:'bank',amount:0,memo:'계좌',name:'기기 은행',sortOrder:0}],
  transactions:[{id,type:'expense',date:'2026-10-21',time:'09:13',amount:100,title:'기기 기록 한글 ✓',category:'dates',assetId:'bank',recurringRuleId:'rule',createdAt:42}],
  recurringRules:[{id:'rule',type:'expense',day:21,time:'09:13',amount:100,title:'정기',category:'dates',assetId:'bank',startMonth:'2026-10'}],
  customExpenseCategories:[{id:'dates',label:'데이트',color:'#123456'}],plans:[{type:'expense',category:'dates',plannedAmount:500}],
  deletedRecurringTxs:['rec_rule_2026-11'],budget:12345,categoryLabels:{dates:'데이트'},assetOrderRevisions:{bank:2}});
 return data;
}
async function fixture(){
 const auth=new DatabaseSync(':memory:'),finance=new DatabaseSync(':memory:'),shared=new DatabaseSync(':memory:');
 for(const file of ['auth-foundation-schema.sql','ledger-invitations-schema.sql','shared-creation-auth-schema.sql'])auth.exec(readFileSync('scripts/'+file,'utf8'));
 finance.exec(readFileSync('scripts/android-sandbox-schema.sql','utf8'));shared.exec(readFileSync('scripts/shared-creation-finance-schema.sql','utf8'));
 const db=adapter(auth),pdb=adapter(finance),sdb=adapter(shared),legacyUser=randomUUID(),legacyLedger=randomUUID();
 auth.prepare('INSERT INTO users VALUES(?,?,?)').run(legacyUser,'active',1);
 auth.prepare('INSERT INTO ledgers VALUES(?,?,?,?)').run(legacyLedger,legacyUser,'Legacy personal',1);
 auth.prepare('INSERT INTO ledger_memberships VALUES(?,?,?,?)').run(legacyLedger,legacyUser,'owner',1);
 finance.exec('CREATE TABLE memoney_test_database(id TEXT PRIMARY KEY,ledger_id TEXT)');finance.prepare('INSERT INTO memoney_test_database VALUES(?,?)').run('memoney-android-test-personal',legacyLedger);
 auth.exec(readFileSync('scripts/personal-onboarding-auth-schema.sql','utf8'));
 const origin='https://memoney-android-test.pages.dev';
 const env={DB:db,TEST_FINANCE:pdb,TEST_SHARED_FINANCE:sdb,AUTH_ENABLED:'true',AUTH_GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',AUTH_ORIGIN:origin,
  AUTH_PERSONAL_ONBOARDING:'true',AUTH_SHARED_TEST_DEPLOYMENT:'true',AUTH_TEST_PERSONAL_LEDGER:'true',AUTH_TEST_MULTI_LEDGER:'true',AUTH_LEDGER_RECOVERY:'true',AUTH_SHARED_WALLET_LEDGER_ID:legacyLedger};
 const login=async(subject=randomUUID())=>{const id=await resolveUser(db,{issuer:'https://accounts.google.com',subject});const session=await createSession(db,id,Date.now(),true);return {id,token:session.token};};
 const request=(session,path='/api/wallet/onboarding',body,ledger)=>new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{Cookie:`__Host-mywallet-session=${session?.token||''}`,Origin:origin,'Content-Type':'application/json',...(ledger?{'X-Memoney-Ledger':ledger}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const call=(session,body,ledger)=>handlePersonalOnboarding(request(session,undefined,body,ledger),env);
 const read=async session=>{const ledger=await ensurePersonalLedger(env,session.id);return {ledger,db:personalFinance(env,ledger)};};
 return {auth,finance,db,pdb,shared,env,origin,legacyUser,legacyLedger,login,request,call,read,close(){auth.close();finance.close();shared.close();}};
}
test('first empty personal import is complete, atomic, UTF-8 safe and preserves local source',async()=>{
 const f=await fixture();try{
  const user=await f.login(),s=storage(),id=randomUUID();s.setItem(GUEST_ID_KEY,id);s.setItem(guestKey(id),JSON.stringify(snapshot()));const original=s.getItem(guestKey(id));
  const req=async(url,init={})=>{assert.notEqual(url,'/api/data','No incremental merge writes');return f.call(user,init.body?JSON.parse(init.body):undefined,init.headers?.['X-Memoney-Ledger']);};
  const result=await completePersonalOnboarding(req,s);assert.equal(result.outcome,'imported');assert.equal(s.getItem(guestKey(id)),original);assert.equal(s.getItem(GUEST_ID_KEY),id);
  const response=await sharedWalletData(f.request(user,'/api/data'),f.env);assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.transactions[0].title,'기기 기록 한글 ✓');assert.equal(data.transactions[0].time,'09:13');assert.equal(data.recurringRules[0].time,'09:13');
  assert.equal(data.assets[0].id,'bank');assert.equal(data.plans[0].plannedAmount,500);assert.equal(data.budget,12345);assert.equal(data.customExpenseCategories[0].label,'데이트');assert.equal(data.assetOrderRevisions.bank,2);assert.deepEqual(data.deletedRecurringTxs,['rec_rule_2026-11']);
  await completePersonalOnboarding(req,s);assert.equal((await f.read(user)).db?true:false,true);
  assert.equal((await (await sharedWalletData(f.request(user,'/api/data'),f.env)).json()).transactions.length,1);
 }finally{f.close();}
});
test('any existing data wins, local payload is neither read nor uploaded; metadata survives emptying',async()=>{
 const f=await fixture();try{
  const user=await f.login(),{db,ledger}=await f.read(user);await db.prepare("INSERT INTO settings VALUES('budget','9876')").run();
  const s=storage();s.getItem=()=>{throw Error('Must not read device data for existing ledger');};
  const result=await completePersonalOnboarding(async(url,init)=>{assert.equal(init.method,'GET');return f.call(user);},s);
  assert.equal(result.outcome,'existing');assert.equal(result.ledger.id,ledger.id);
  await db.prepare('DELETE FROM settings').run();
  assert.equal((await (await f.call(user,{snapshot:snapshot()})).json()).outcome,'existing');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM transactions').first()).n,0);
 }finally{f.close();}
});
test('two simultaneous first logins select one session and one personal UUID; losing device waits then switches',async()=>{
 const f=await fixture();try{
  const [a,b]=await Promise.all([f.login('same-google-sub'),f.login('same-google-sub')]);assert.equal(a.id,b.id);
  const states=await Promise.all([f.call(a).then(r=>r.json()),f.call(b).then(r=>r.json())]);assert.equal(states[0].ledger.id,states[1].ledger.id);
  assert.deepEqual(states.map(s=>s.status).sort(),['pending','waiting']);
  const first=states[0].status==='pending'?a:b,other=first===a?b:a;
  assert.equal((await f.call(other,{snapshot:snapshot('loser')})).status,202);
  assert.equal((await (await f.call(first,{snapshot:snapshot('winner')})).json()).outcome,'imported');
  const result=await (await f.call(other,{snapshot:snapshot('loser')})).json();assert.equal(result.status,'complete');
  const {db}=await f.read(other);assert.deepEqual((await db.prepare('SELECT id FROM transactions').all()).results.map(r=>r.id),['winner']);
  assert.equal(f.auth.prepare('SELECT COUNT(*) AS n FROM personal_ledgers WHERE user_id=?').get(a.id).n,1);
 }finally{f.close();}
});
test('parallel first requests and uncertain successful response never duplicate or overwrite a row',async()=>{
 const f=await fixture();try{
  const user=await f.login();const responses=await Promise.all([f.call(user,{snapshot:snapshot('a')}),f.call(user,{snapshot:snapshot('b')})]);
  for(const response of responses)assert.equal(response.status,200,f.pdb.lastError?.message);
  const {db}=await f.read(user),before=await db.prepare('SELECT * FROM transactions').all();assert.equal(before.results.length,1);
  await f.call(user,{snapshot:snapshot('retry-other-body')});assert.deepEqual((await db.prepare('SELECT * FROM transactions').all()).results,before.results);
 }finally{f.close();}
});
test('failure halfway through financial transaction rolls back all rows and completion, retry succeeds',async()=>{
 const f=await fixture();try{
  const user=await f.login();await f.call(user);const {db}=await f.read(user);
  f.pdb.fail=sql=>/INSERT INTO .*recurring_rules/.test(sql);
  assert.equal((await f.call(user,{snapshot:snapshot()})).status,409);
  for(const table of ['transactions','assets','settings'])assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n,0);
  assert.equal(f.finance.prepare('SELECT COUNT(*) AS n FROM memoney_personal_onboarding').get().n,0);
  f.pdb.fail=null;assert.equal((await (await f.call(user,{snapshot:snapshot()})).json()).outcome,'imported');
 }finally{f.close();}
});
test('a normal row written between emptiness check and transaction is never overwritten',async()=>{
 const f=await fixture();try{
  const user=await f.login();await f.call(user);const {db}=await f.read(user);
  f.pdb.before=async items=>{if(items.some(s=>s.sql.includes('INSERT INTO memoney_personal_onboarding'))){f.pdb.before=null;await db.prepare("INSERT INTO settings VALUES('budget','5555')").run();}};
  assert.equal((await f.call(user,{snapshot:snapshot()})).status,409);
  const result=await (await f.call(user,{snapshot:snapshot()})).json();assert.equal(result.outcome,'existing');
  assert.equal((await db.prepare("SELECT value FROM settings WHERE key='budget'").first()).value,'5555');assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM transactions').first()).n,0);
 }finally{f.close();}
});
test('logout/relogin, abandoned first session, expiry and historical users cannot reopen initial import',async()=>{
 const f=await fixture();try{
  const first=await f.login('relogin');await f.call(first);await revokeSession(f.db,first.token);
  const next=await f.login('relogin');assert.equal((await (await f.call(next,{snapshot:snapshot()})).json()).outcome,'skipped');
  const expired=await f.login();f.auth.prepare('UPDATE personal_onboarding_accounts SET expires_at=0 WHERE user_id=?').run(expired.id);
  assert.equal((await (await f.call(expired,{snapshot:snapshot()})).json()).outcome,'skipped');
  const session=await createSession(f.db,f.legacyUser,Date.now(),true),legacy={id:f.legacyUser,token:session.token};
  const result=await (await f.call(legacy,{snapshot:snapshot()})).json();assert.equal(result.outcome,'skipped');assert.equal(result.ledger.id,f.legacyLedger);
  assert.equal(f.finance.prepare('SELECT COUNT(*) AS n FROM transactions').get().n,0);
 }finally{f.close();}
});
test('real seven-day reset changes generation but never clears onboarding completion',async()=>{
 const f=await fixture();try{
  const user=await f.login('reset');await f.call(user,{snapshot:snapshot()});
  const get=await handleRecovery(f.request(user,'/api/wallet/recovery'),f.env);assert.equal(get.status,200);const current=await get.json();
  const reset=await handleRecovery(f.request(user,'/api/wallet/recovery',{action:'reset',operationId:randomUUID(),generation:current.generation,version:current.version}),f.env);assert.equal(reset.status,200);
  const other=await f.login('reset');assert.equal((await (await f.call(other,{snapshot:snapshot('must-not-import')})).json()).outcome,'imported');
  const {db}=await f.read(other);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM transactions').first()).n,0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM memoney_recoveries').first()).n,1);
 }finally{f.close();}
});
test('anonymous, other-user, shared target, forged origin and direct context/data bypasses are blocked',async()=>{
 const f=await fixture();try{
  const a=await f.login(),b=await f.login();const own=await (await f.call(a)).json();
  assert.equal((await f.call(null,{snapshot:snapshot()})).status,401);
  assert.equal((await f.call(b,{snapshot:snapshot()},own.ledger.id)).status,403);
  assert.equal((await f.call(a,{snapshot:snapshot()},randomUUID())).status,403);
  assert.equal((await sharedWalletContext(f.request(a,'/api/wallet/context'),f.env)).status,425);
  assert.equal((await sharedWalletData(f.request(a,'/api/data'),f.env)).status,425);
  assert.equal((await onRequestGet({request:f.request(null,'/api/data'),env:f.env})).status,401);
  assert.equal((await onRequestGet({request:f.request(a,'/api/data'),env:f.env})).status,425);
  const patch=new Request(f.request(a,'/api/data',{op:'setting.set',key:'budget',value:5}),{method:'PATCH'});
  assert.equal((await onRequestPatch({request:patch,env:f.env})).status,425);
  assert.equal((await handleLedgers(f.request(a,'/api/wallet/ledgers',{action:'create',name:'forbidden',source:'personal',operationId:randomUUID()}),f.env)).status,425);
  const bad=f.request(a,undefined,{snapshot:snapshot()});bad.headers.set('Origin','https://evil.example');assert.equal((await handlePersonalOnboarding(bad,f.env)).status,403);
  await f.call(a,{snapshot:snapshot()});await f.call(b,{snapshot:null});
  assert.equal((await onRequestGet({request:f.request(a,'/api/data'),env:f.env})).status,200);
  assert.equal((await sharedWalletData(f.request(b,'/api/data',undefined,own.ledger.id),f.env)).status,403);
  assert.equal((await f.call(a,{snapshot:snapshot()},randomUUID())).status,403);
 }finally{f.close();}
});
test('direct wallet context prepares only the current guest generation; source and old journal remain untouched',async()=>{
 const f=await fixture();try{
  const user=await f.login(),s=storage(),id=randomUUID(),generation=randomUUID();s.setItem(GUEST_ID_KEY,id);s.setItem(`memoney:guest:${id}:recovery-generation`,generation);
  s.setItem(guestKey(id),JSON.stringify(snapshot('old-generation')));s.setItem(`memoney:guest:${id}:mywallet:v2:generation:${generation}`,JSON.stringify(snapshot('active-generation')));
  const before=[...s.rows];globalThis.window={localStorage:s,fetch:async(url,init={})=>{
   if(url==='/api/wallet/onboarding')return f.call(user,init.body?JSON.parse(init.body):undefined,init.headers?.['X-Memoney-Ledger']);
   return sharedWalletContext(f.request(user,url,undefined,init.headers?.['X-Memoney-Ledger']),f.env);
  }};
  const context=await readWalletContext();assert.equal(context.ledger.kind,'personal');
  for(const [key,value] of before)assert.equal(s.getItem(key),value);
  const {db}=await f.read(user);assert.equal((await db.prepare('SELECT id FROM transactions').first()).id,'active-generation');
 }finally{delete globalThis.window;f.close();}
});
test('Google login issues first-owner metadata atomically; a new login uses the same issuer/sub account',async()=>{
 const f=await fixture();try{
  const login=async()=>{
   const challenge=await handleAuth(new Request(f.origin+'/api/auth/challenge',{method:'POST',headers:{Origin:f.origin}}),f.env,'challenge');
   const cookie=challenge.headers.get('Set-Cookie').split(';')[0];
   const response=await handleAuth(new Request(f.origin+'/api/auth/google',{method:'POST',headers:{Origin:f.origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({idToken:'fixture'})}),f.env,'google',async()=>({issuer:'https://accounts.google.com',subject:'google-sub',email:'fixture@gmail.com',authoritativeEmail:true}));
   assert.equal(response.status,200);return (await response.json()).user.id;
  };
  const id=await login();const first=f.auth.prepare('SELECT * FROM personal_onboarding_accounts WHERE user_id=?').get(id);assert(first.first_session_hash);
  assert.equal(await login(),id);assert.deepEqual(f.auth.prepare('SELECT * FROM personal_onboarding_accounts WHERE user_id=?').get(id),first);
 }finally{f.close();}
});
test('no local source consumes first opportunity; later device data never imports',async()=>{
 const f=await fixture();try{
  const user=await f.login('empty-source'),s=storage();
  const call=(url,init)=>f.call(user,init.body?JSON.parse(init.body):undefined,init.headers?.['X-Memoney-Ledger']);
  assert.equal((await completePersonalOnboarding(call,s)).outcome,'empty');
  const next=await f.login('empty-source');assert.equal((await (await f.call(next,{snapshot:snapshot()})).json()).outcome,'empty');
  assert.equal((await (await sharedWalletData(f.request(next,'/api/data'),f.env)).json()).transactions.length,0);
 }finally{f.close();}
});
test('invalid/oversized snapshots fail without rows; SQL-shaped identifiers stay data; full card history survives',async()=>{
 const f=await fixture();try{
  const user=await f.login();const malformed=snapshot();malformed.transactions[0].assetId='missing';
  assert.equal((await f.call(user,{snapshot:malformed})).status,400);
  assert.equal((await f.call(user,{snapshot:{...snapshot(),transactions:[{...snapshot().transactions[0],title:'x'.repeat(1_500_000)}]}})).status,413);
  const s=storage(),id=randomUUID();
  for(const body of [
   {op:'asset.create',asset:{id:'bank',category:'bank',name:'은행',memo:'',amount:0}},
   {op:'asset.create',asset:{id:'card',category:'card',name:'카드',memo:'',amount:0,cardPaymentAssetId:'bank'}},
   {op:'transaction.create',operationId:randomUUID(),transaction:{id:"quote'); DELETE FROM transactions;--",type:'expense',date:'2026-10-21',amount:123,title:'카드 기록',category:'food',assetId:'card'}},
   {op:'card.settle',operationId:randomUUID(),settlementId:'settled',transactionId:'transfer',cardAssetId:'card',paymentAssetId:'bank',periodStart:'2026-10-01',periodEnd:'2026-10-31',dueDate:'2026-11-01',settledDate:'2026-10-21'},
  ])assert.equal((await localWalletFetch(id,'/api/data',{method:'PATCH',body:JSON.stringify(body)},s)).status,200);
  const source=localSnapshot(s,id),result=await f.call(user,{snapshot:source});assert.equal(result.status,200);
  const saved=await (await sharedWalletData(f.request(user,'/api/data'),f.env)).json();
  assert.equal(saved.transactions.length,2);assert.equal(saved.assets.length,2);assert.deepEqual(saved.cardSettlements,source.cardSettlements);
  assert.equal(saved.transactions.find(t=>t.type==='expense').cardSettlementId,'settled');
 }finally{f.close();}
});
test('browser approval does not consume first login; original-browser claim creates the immutable owner',async()=>{
 const f=await fixture();f.env.AUTH_BROWSER_LOGIN='true';try{
  const call=(action,body={},cookie='')=>handleAuth(new Request(f.origin+'/api/auth/'+action,{method:'POST',headers:{Origin:f.origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)}),f.env,action,async()=>({issuer:'https://accounts.google.com',subject:'browser-sub',email:'fixture@gmail.com',authoritativeEmail:true}));
  const start=await call('browser-start'),flow=await start.json(),cookie=start.headers.get('Set-Cookie').split(';')[0],approval=new URL(flow.url).hash.slice(9);
  assert.equal((await call('browser-approve',{approval,code:flow.code,idToken:'fixture'})).status,200);
  assert.equal(f.auth.prepare('SELECT COUNT(*) AS n FROM personal_onboarding_accounts WHERE first_session_hash IS NOT NULL').get().n,0);
  const claim=await call('browser-claim',{code:flow.code,email:'fixture@gmail.com'},cookie);assert.equal(claim.status,200);
  const {user}=await claim.json();assert(f.auth.prepare('SELECT first_session_hash FROM personal_onboarding_accounts WHERE user_id=?').get(user.id).first_session_hash);
 }finally{f.close();}
});
test('shared creation copies only its owners prepared personal ledger, never another users legacy data',async()=>{
 const f=await fixture();try{
  f.finance.prepare("INSERT INTO transactions(id,type,date,amount,title,category) VALUES('legacy-row','income','2026-10-21',999,'legacy','salary')").run();
  const owner=await f.login();await f.call(owner,{snapshot:snapshot('own-row')});
  let response=await handleLedgers(f.request(owner,'/api/wallet/ledgers',{action:'create',name:'공유',source:'personal',operationId:randomUUID()}),f.env);
  assert.equal(response.status,200);let {creation}=await response.json();
  for(let count=0;count<10&&creation.status!=='ready';count++){
   response=await handleLedgers(f.request(owner,'/api/wallet/ledgers',{action:'continue',ledgerId:creation.id}),f.env);assert.equal(response.status,200);creation=(await response.json()).creation;
  }
  assert.equal(creation.status,'ready');const copied=scopedFinance(f.env.TEST_SHARED_FINANCE,creation.id);
  assert.deepEqual((await copied.prepare('SELECT id FROM transactions').all()).results.map(r=>r.id),['own-row']);
  assert.equal(f.finance.prepare('SELECT id FROM transactions').get().id,'legacy-row');
 }finally{f.close();}
});
test('a mounted stale guest generation is not repinned or uploaded during first preparation',async()=>{
 const f=await fixture();try{
  const user=await f.login(),s=storage(),id=randomUUID();s.setItem(GUEST_ID_KEY,id);s.setItem(guestKey(id),JSON.stringify(snapshot()));pinGuestGeneration(id,s);
  s.setItem(`memoney:guest:${id}:recovery-generation`,randomUUID());let posts=0;
  await assert.rejects(completePersonalOnboarding(async(url,init)=>{if(init.method==='POST')posts++;return f.call(user);},s),/LOCAL_GENERATION_CHANGED/);
  assert.equal(posts,0);assert.throws(()=>assertGuestGeneration(id,s),/LOCAL_GENERATION_CHANGED/);
 }finally{f.close();}
});
test('account switching between preparation and upload cannot move a source into the new accounts ledger',async()=>{
 const f=await fixture();try{
  const a=await f.login(),b=await f.login(),s=storage(),id=randomUUID();s.setItem(GUEST_ID_KEY,id);s.setItem(guestKey(id),JSON.stringify(snapshot()));
  await assert.rejects(completePersonalOnboarding((url,init)=>f.call(init.method==='POST'?b:a,init.body?JSON.parse(init.body):undefined,init.headers?.['X-Memoney-Ledger']),s),/PERSONAL_LEDGER_REQUIRED/);
  for(const user of [a,b]){const {db}=await f.read(user);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM transactions').first()).n,0);}
 }finally{f.close();}
});
