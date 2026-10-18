import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createSession } from '../server/auth/store.ts';
import { handleLedgers } from '../server/wallet/shared-creation.ts';
import { sharedWalletData, sharedWalletContext } from '../server/wallet/shared-web.ts';
import { handleSharing } from '../server/wallet/invitations.ts';
import { scopedSql, scopedFinance, copyTables } from '../server/wallet/scoped-finance.ts';

function adapter(sqlite){return {prepare(sql){return {sql,values:[],bind(...v){this.values=v;return this;},async first(){return sqlite.prepare(sql).get(...this.values)||null;},async all(){return {results:sqlite.prepare(sql).all(...this.values)};},async run(){return {meta:{changes:sqlite.prepare(sql).run(...this.values).changes}};}};},
  async batch(statements){sqlite.exec('BEGIN');try{const r=statements.map(s=>{const query=sqlite.prepare(s.sql);return /^SELECT/i.test(s.sql)?{results:query.all(...s.values),meta:{changes:0}}:{meta:{changes:query.run(...s.values).changes}};});sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};}
async function fixture(){const auth=new DatabaseSync(':memory:'),personal=new DatabaseSync(':memory:'),shared=new DatabaseSync(':memory:');
  for(const file of ['auth-foundation-schema.sql','ledger-invitations-schema.sql','shared-creation-auth-schema.sql'])auth.exec(readFileSync(new URL(file,import.meta.url),'utf8'));
  personal.exec(readFileSync(new URL('android-sandbox-schema.sql',import.meta.url),'utf8'));shared.exec(readFileSync(new URL('shared-creation-finance-schema.sql',import.meta.url),'utf8'));
  const owner=randomUUID(),guest=randomUUID(),other=randomUUID(),ledger=randomUUID();const db=adapter(auth),pdb=adapter(personal),sdb=adapter(shared),now=Date.now(),cookies={};
  for(const [id,email] of [[owner,'owner@gmail.com'],[guest,'guest@gmail.com'],[other,'other@gmail.com']]){
    auth.prepare('INSERT INTO users VALUES(?,?,?)').run(id,'active',now);auth.prepare('INSERT INTO auth_identity_profiles VALUES(?,?,?,?)').run(id,email,1,now);
    cookies[id]=`__Host-mywallet-session=${(await createSession(db,id)).token}`;
  }
  auth.prepare('INSERT INTO ledgers VALUES(?,?,?,?)').run(ledger,owner,'Personal',now);auth.prepare('INSERT INTO ledger_memberships VALUES(?,?,?,?)').run(ledger,owner,'owner',now);
  personal.exec('CREATE TABLE memoney_test_database(id TEXT PRIMARY KEY,ledger_id TEXT)');personal.prepare('INSERT INTO memoney_test_database VALUES(?,?)').run('memoney-android-test-personal',ledger);
  personal.prepare('INSERT INTO assets(id,category,amount,memo,name) VALUES(?,?,?,?,?)').run('a','bank',0,'','Bank');
  personal.prepare('INSERT INTO recurring_rules(id,type,day,amount,title,category,startMonth,asset_id,transaction_time) VALUES(?,?,?,?,?,?,?,?,?)').run('r','expense',1,100,'정기 시험','food','2026-10','a','09:30');
  personal.prepare('INSERT INTO deleted_recurring_txs VALUES(?)').run('rec_r_2026-11');
  for(let n=0;n<85;n++)personal.prepare('INSERT INTO transactions(id,type,date,amount,title,category,asset_id,recurring_rule_id,transaction_time) VALUES(?,?,?,?,?,?,?,?,?)').run('t'+n,'expense','2026-10-14',100,'복사 시험','food','a','r','12:30');
  personal.prepare('INSERT INTO settings VALUES(?,?)').run('theme','dark');personal.prepare('INSERT INTO settings VALUES(?,?)').run('budget','12345');
  personal.prepare('INSERT INTO plans VALUES(?,?,?)').run('food','expense',5000);
  personal.prepare('INSERT INTO custom_categories(id,type,label,color) VALUES(?,?,?,?)').run('custom','expense','시험 분류','#123456');
  personal.prepare('INSERT INTO assets(id,category,amount,memo,name,kind,card_payment_asset_id) VALUES(?,?,?,?,?,?,?)').run('card','card',0,'','Card','liability','a');
  personal.prepare('INSERT INTO card_settlements VALUES(?,?,?,?,?,?,?,?,?)').run('settlement','card','a','2026-09-01','2026-09-30','2026-10-14',100,'t0',Date.now());
  personal.prepare('UPDATE transactions SET card_settlement_id=? WHERE id=?').run('settlement','t0');
  personal.prepare('INSERT INTO sync_groups VALUES(?,?)').run('asset-order:bank',3);
  const env={DB:db,TEST_FINANCE:pdb,TEST_SHARED_FINANCE:sdb,AUTH_ENABLED:'true',AUTH_GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',AUTH_ORIGIN:'https://memoney-android-test.pages.dev',AUTH_SHARED_TEST_DEPLOYMENT:'true',AUTH_TEST_PERSONAL_LEDGER:'true',AUTH_TEST_MULTI_LEDGER:'true',AUTH_LEDGER_INVITES:'true',AUTH_SHARED_WALLET_LEDGER_ID:ledger};
  const req=(body,user=owner,selected,method)=>new Request(env.AUTH_ORIGIN+'/api/wallet/ledgers',{method:method||(body?'POST':'GET'),headers:{Cookie:cookies[user]||'',Origin:env.AUTH_ORIGIN,'Content-Type':'application/json',...(selected?{'X-Memoney-Ledger':selected}:{})},body:body?JSON.stringify(body):undefined});
  const call=(body,user)=>handleLedgers(req(body,user),env);
  const create=async(source='personal',user=owner)=>{const body={action:'create',name:'우리 장부',source,operationId:randomUUID()};let response=await call(body,user);assert.equal(response.status,200);let job=(await response.json()).creation;const percents=[job.percent];
    while(job.status!=='ready'){response=await call({action:'continue',ledgerId:job.id},user);assert.equal(response.status,200);job=(await response.json()).creation;percents.push(job.percent);}return {job,body,percents};};
  return {auth,personal,shared,owner,guest,other,ledger,env,req,call,create,close(){auth.close();personal.close();shared.close();}};
}

test('web compatibility reuses Android IDs/data and native changes without copying or changing membership',async()=>{
  const f=await fixture();try {
    const android={...f.env};
    f.env.AUTH_ORIGIN='https://mywallet-8mx.pages.dev';f.env.AUTH_ANDROID_DATA_COMPAT='true';
    const before=f.auth.prepare('SELECT COUNT(*) n FROM ledger_memberships').get().n;
    const context=await sharedWalletContext(f.req(null),f.env);assert.equal(context.status,200);
    assert.equal((await context.json()).ledger.id,f.ledger);
    let snapshot=await (await sharedWalletData(f.req(null),f.env)).json();assert.equal(snapshot.transactions.length,85);
    const tx=snapshot.transactions.find(t=>t.id==='t1');
    const updated=await sharedWalletData(f.req({op:'transaction.update',operationId:randomUUID(),expectedRevision:tx.revision,transaction:{...tx,amount:101}},f.owner,undefined,'PATCH'),f.env);
    assert.equal(updated.status,200);
    const native=new Request(android.AUTH_ORIGIN+'/api/data',{headers:{Cookie:f.req(null).headers.get('Cookie')}});
    snapshot=await (await sharedWalletData(native,android)).json();assert.equal(snapshot.transactions.find(t=>t.id==='t1').amount,101);
    assert.equal((await sharedWalletData(f.req(null,f.other,f.ledger),f.env)).status,403);
    assert.equal(f.auth.prepare('SELECT COUNT(*) n FROM ledger_memberships').get().n,before);
    assert.equal((await sharedWalletContext(f.req(null),{...f.env,AUTH_ANDROID_DATA_COMPAT:undefined})).status,503);
    assert.equal((await sharedWalletContext(f.req(null),{...f.env,AUTH_SHARED_WALLET_ORIGIN:'https://mywallet-8mx.pages.dev'})).status,503);
  }finally{f.close();}
});
test('copy is resumable, owner-limited and preserves timed recurrence and all source records',async()=>{const f=await fixture();try{
  const initial={action:'create',name:' 우리 장부 ',source:'personal',operationId:randomUUID()};const started=await (await f.call(initial)).json();assert.equal(started.creation.percent,0);const id=started.creation.id;
  assert.equal((await sharedWalletData(f.req(null,f.owner,id),f.env)).status,403);
  assert.equal((await handleSharing(f.req({action:'create',ledgerId:id,email:'guest@gmail.com',role:'editor'}),f.env)).status,403);
  let job=(await (await f.call({action:'continue',ledgerId:id})).json()).creation;assert(job.percent>0&&job.percent<100);
  const before=job.completed;job=(await (await f.call(initial)).json()).creation;assert(job.completed>=before);
  const saved=await (await f.call()).json();assert.equal(saved.creation.id,id);
  while(job.status!=='ready')job=(await (await f.call({action:'continue',ledgerId:id})).json()).creation;
  assert.equal(job.percent,100);const scope=scopedFinance(f.env.TEST_SHARED_FINANCE,id);
  assert.equal((await scope.prepare('SELECT COUNT(*) AS n FROM transactions').first()).n,85);
  assert.equal((await scope.prepare('SELECT transaction_time FROM recurring_rules WHERE id=?').bind('r').first()).transaction_time,'09:30');
  assert.equal((await scope.prepare('SELECT id FROM deleted_recurring_txs').first()).id,'rec_r_2026-11');
  for(const table of copyTables) {
    const expected=f.personal.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().filter(row=>table!=='settings'||!['theme','styleTheme'].includes(row.key))
      .map(row=>table==='transactions'?{...row,last_operation_id:null}:row).map(row=>JSON.stringify(row)).sort();
    const actual=(await scope.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results.map(row=>JSON.stringify(row)).sort();
    assert.deepEqual(actual,expected,table+' all rows, columns and references');
  }
  assert.equal(await scope.prepare("SELECT value FROM settings WHERE key='theme'").first(),null);
  assert.equal((await f.call({...initial,operationId:randomUUID()})).status,409);
  assert.equal(f.auth.prepare('SELECT COUNT(*) AS n FROM created_shared_ledgers WHERE owner_user_id=?').get(f.owner).n,1);
  assert.equal(f.personal.prepare('SELECT COUNT(*) AS n FROM transactions').get().n,85);
  const snapshot=await (await sharedWalletData(f.req(null,f.owner,id),f.env)).json();assert.equal(snapshot.transactions.length,85);assert.equal(snapshot.budget,12345);
  assert.equal((await (await sharedWalletContext(f.req(null,f.owner,id),f.env)).json()).ledger.name,'우리 장부');
}finally{f.close();}});
test('different owners and identical row IDs stay isolated; empty creation and invitations work',async()=>{const f=await fixture();try{
  const one=await f.create(),two=await f.create('empty',f.other);assert.equal(two.job.percent,100);
  assert.equal((await sharedWalletData(f.req(null,f.owner,two.job.id),f.env)).status,403);
  const invite=await handleSharing(f.req({action:'create',ledgerId:one.job.id,email:'guest@gmail.com',role:'editor'}),f.env);assert.equal(invite.status,201);const token=(await invite.json()).token;
  const inbox=await (await handleSharing(f.req(null,f.guest),f.env)).json();assert.equal(inbox.receivedInvitations.length,1);assert.equal(inbox.receivedInvitations[0].name,'우리 장부');
  const accepted=await handleSharing(f.req({action:'accept',token},f.guest),f.env);assert.equal(accepted.status,200);assert.equal((await accepted.json()).ledgerId,one.job.id);
  const tx={id:'t0',type:'expense',date:'2026-10-14',amount:777,title:'Separate',category:'food'};
  const response=await sharedWalletData(f.req({op:'transaction.create',operationId:randomUUID(),transaction:tx},f.other,two.job.id,'PATCH'),f.env);assert.equal(response.status,200);
  assert.equal((await (await sharedWalletData(f.req(null,f.guest,one.job.id),f.env)).json()).transactions.find(t=>t.id==='t0').amount,100);
  assert.equal(f.personal.prepare('SELECT amount FROM transactions WHERE id=?').get('t0').amount,100);
  assert.equal((await handleSharing(f.req({action:'create',ledgerId:one.job.id,email:'other@gmail.com',role:'viewer'},f.guest),f.env)).status,403);
  assert.equal((await f.call({action:'rename',ledgerId:one.job.id,name:'새 이름'})).status,200);
  assert.equal((await f.call({action:'rename',ledgerId:one.job.id,name:'x'.repeat(31)})).status,400);
  assert.equal((await f.call({action:'create',operationId:randomUUID(),name:'Mine',source:'personal'},f.guest)).status,403);
}finally{f.close();}});
test('concurrent requests reserve only one shared ledger per owner and SQL strings remain intact',async()=>{const f=await fixture();try{
  const bodies=[1,2].map(n=>({action:'create',operationId:randomUUID(),name:'Book '+n,source:'empty'}));const responses=await Promise.all(bodies.map(b=>f.call(b)));
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(f.auth.prepare('SELECT COUNT(*) AS n FROM created_shared_ledgers').get().n,1);
  assert.equal(f.auth.prepare('SELECT COUNT(*) AS n FROM ledgers').get().n,2);
  const sql=scopedSql("SELECT * FROM transactions WHERE title='assets'",f.ledger);assert(sql.includes("title='assets'"));assert(!sql.includes('FROM transactions'));
}finally{f.close();}});
