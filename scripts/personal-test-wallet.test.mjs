import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createSession } from '../server/auth/store.ts';
import { sharedWalletConfiguration, sharedWalletContext, sharedWalletData } from '../server/wallet/shared-web.ts';
import { handleSharing } from '../server/wallet/invitations.ts';

function adapter(sqlite) {
  return {prepare(sql){return {sql,values:[],bind(...values){this.values=values;return this;},
    async first(){return sqlite.prepare(sql).get(...this.values)??null;},
    async all(){return {results:sqlite.prepare(sql).all(...this.values)};},
    async run(){return {meta:{changes:sqlite.prepare(sql).run(...this.values).changes}};}};},
    async batch(statements){sqlite.exec('BEGIN');try {const result=statements.map(s=>({meta:{changes:sqlite.prepare(s.sql).run(...s.values).changes}}));sqlite.exec('COMMIT');return result;}
      catch(error){sqlite.exec('ROLLBACK');throw error;}}};
}
async function fixture() {
  const auth=new DatabaseSync(':memory:'), finance=new DatabaseSync(':memory:');
  auth.exec(readFileSync(new URL('./auth-foundation-schema.sql',import.meta.url),'utf8'));
  auth.exec(readFileSync(new URL('./ledger-invitations-schema.sql',import.meta.url),'utf8'));
  finance.exec(readFileSync(new URL('./android-sandbox-schema.sql',import.meta.url),'utf8'));
  const ledger=randomUUID(), owner=randomUUID(), viewer=randomUUID(), db=adapter(auth);
  for(const id of [owner,viewer]) auth.prepare('INSERT INTO users VALUES (?,?,?)').run(id,'active',1);
  auth.prepare('INSERT INTO ledgers VALUES (?,?,?,?)').run(ledger,owner,'Personal',1);
  for(const [id,role] of [[owner,'owner'],[viewer,'viewer']]) auth.prepare('INSERT INTO ledger_memberships VALUES (?,?,?,?)').run(ledger,id,role,1);
  finance.exec('CREATE TABLE memoney_test_database(id TEXT PRIMARY KEY,ledger_id TEXT NOT NULL)');
  finance.prepare('INSERT INTO memoney_test_database VALUES (?,?)').run('memoney-android-test-personal',ledger);
  const origin='https://memoney-android-test.pages.dev';
  const env={DB:db,TEST_FINANCE:adapter(finance),AUTH_ENABLED:'true',AUTH_GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',
    AUTH_ORIGIN:origin,AUTH_SHARED_TEST_DEPLOYMENT:'true',AUTH_TEST_PERSONAL_LEDGER:'true',AUTH_LEDGER_INVITES:'true',AUTH_SHARED_WALLET_LEDGER_ID:ledger};
  const cookies={};for(const id of [owner,viewer]) cookies[id]=`__Host-mywallet-session=${(await createSession(db,id)).token}`;
  const request=(body,id=owner,suffix='')=>new Request(origin+'/api/data'+suffix,{method:body?'PATCH':'GET',
    headers:{Cookie:cookies[id]||'',Origin:origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  return {auth,finance,owner,viewer,ledger,env,request,close(){auth.close();finance.close();}};
}
test('personal test database is owner-only, guarded and never forwards requests to the web database',async()=>{
  const f=await fixture();let upstreamCalls=0;const upstream=async()=>{upstreamCalls++;throw Error('Production must never be contacted');};
  try {
    const data=async request=>sharedWalletData(request,f.env,upstream);
    assert.equal((await data(f.request(null,'anonymous'))).status,401);
    assert.equal((await data(f.request(null,f.viewer))).status,403);
    const context=await (await sharedWalletContext(f.request(),f.env)).json();
    assert.equal(context.ledger.kind,'personal');assert.equal(context.ledger.id,f.ledger);
    assert.equal(sharedWalletConfiguration({...f.env,AUTH_SHARED_WALLET_ORIGIN:'https://mywallet-8mx.pages.dev'}),null);
    assert.equal(sharedWalletConfiguration({...f.env,TEST_FINANCE:undefined}),null);
    const tx={id:randomUUID(),type:'expense',date:'2026-10-14',amount:100,title:'Isolated test',category:'food'};
    const create={op:'transaction.create',operationId:randomUUID(),transaction:tx};
    assert.equal((await data(f.request(create))).status,200);
    assert.equal((await data(f.request(create))).status,200);
    assert.equal((await (await data(f.request())).json()).transactions.length,1);
    const update={op:'transaction.update',operationId:randomUUID(),expectedRevision:1,transaction:{...tx,amount:200}};
    assert.equal((await data(f.request(update))).status,200);
    assert.equal((await data(f.request({...update,operationId:randomUUID()}))).status,409);
    const delta=await (await data(f.request(null,f.owner,'?after=0'))).json();assert.equal(delta.changes.length,2);
    assert.equal((await data(f.request({op:'transaction.delete',operationId:randomUUID(),expectedRevision:2,transactionId:tx.id}))).status,200);
    assert.equal((await (await data(f.request())).json()).transactions.length,0);
    f.finance.prepare('UPDATE memoney_test_database SET ledger_id=?').run(randomUUID());
    assert.equal((await data(f.request())).status,503);
    assert.equal(upstreamCalls,0);
  } finally {f.close();}
});
test('personal ledger cannot issue or accept sharing invitations',async()=>{
  const f=await fixture();try {
    const get=await (await handleSharing(f.request(),f.env)).json();
    assert.equal(get.ledger,null);assert.equal(get.personalLedger.id,f.ledger);assert.deepEqual(get.receivedInvitations,[]);
    const source=f.request();const post=new Request(source.url,{method:'POST',headers:source.headers,body:JSON.stringify({action:'create',email:'fixture@gmail.com',role:'editor'})});
    assert.equal((await handleSharing(post,f.env)).status,409);
    assert.equal(f.auth.prepare('SELECT COUNT(*) AS n FROM ledger_invitations').get().n,0);
  } finally {f.close();}
});
