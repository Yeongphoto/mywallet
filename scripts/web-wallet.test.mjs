import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createSession } from '../server/auth/store.ts';
import { webPersonalLedger } from '../server/wallet/web-personal.ts';
import { sharedWalletContext, sharedWalletData } from '../server/wallet/shared-web.ts';
import { handleLedgers } from '../server/wallet/shared-creation.ts';
import { handleSharing } from '../server/wallet/invitations.ts';
import { onRequestGet, onRequestPost } from '../functions/api/data.ts';

function adapter(sqlite) { return {
  prepare(sql) { return { sql, values: [], bind(...values) { this.values=values;return this; },
    async first() { return sqlite.prepare(sql).get(...this.values) ?? null; },
    async all() { return {results:sqlite.prepare(sql).all(...this.values)}; },
    async run() { return {meta:{changes:sqlite.prepare(sql).run(...this.values).changes}}; } }; },
  async batch(statements) { sqlite.exec('BEGIN');try {const r=statements.map(s=>{const q=sqlite.prepare(s.sql);return q.columns().length?{results:q.all(...s.values),meta:{changes:0}}:{meta:{changes:q.run(...s.values).changes}};});sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;} },
}; }
async function fixture() {
  const auth=new DatabaseSync(':memory:'),finance=new DatabaseSync(':memory:');
  for(const file of ['auth-foundation-schema.sql','ledger-invitations-schema.sql','shared-creation-auth-schema.sql','web-wallet-auth-schema.sql']) auth.exec(readFileSync(new URL(file,import.meta.url),'utf8'));
  finance.exec(readFileSync(new URL('web-wallet-finance-schema.sql',import.meta.url),'utf8'));
  const env={DB:adapter(auth),WEB_FINANCE:adapter(finance),AUTH_WEB_WALLETS:'true',AUTH_ENABLED:'true',AUTH_GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',AUTH_ORIGIN:'https://web.example.invalid',AUTH_LEDGER_INVITES:'true'};
  const users=[randomUUID(),randomUUID(),randomUUID()],cookies={};
  for(const [n,id] of users.entries()) {auth.prepare('INSERT INTO users VALUES(?,?,?)').run(id,'active',Date.now());auth.prepare('INSERT INTO auth_identity_profiles VALUES(?,?,?,?)').run(id,`user${n}@gmail.com`,1,Date.now());cookies[id]=`__Host-mywallet-session=${(await createSession(env.DB,id)).token}`;}
  const request=(user=users[0],body,ledger,path='/api/data',method=body?'PATCH':'GET')=>new Request(env.AUTH_ORIGIN+path,{method,headers:{Cookie:cookies[user]||'',Origin:env.AUTH_ORIGIN,'Content-Type':'application/json',...(ledger?{'X-Memoney-Ledger':ledger}:{})},body:body?JSON.stringify(body):undefined});
  const data=(user,body,ledger)=>sharedWalletData(request(user,body,ledger),env,()=>{throw Error('Must not contact production');});
  const ledger=(body,user=users[0])=>handleLedgers(request(user,body,undefined,'/api/wallet/ledgers',body?'POST':'GET'),env);
  const sharing=(body,user=users[0],selected)=>handleSharing(request(user,body,selected,'/api/wallet/sharing',body?'POST':'GET'),env);
  return {auth,finance,env,users,request,data,ledger,sharing,close(){auth.close();finance.close();}};
}
test('web accounts get separate empty personal ledgers; own scope and operation IDs cannot cross',async()=>{
  const f=await fixture();try {
    const [a,b]=f.users;
    const pa=await webPersonalLedger(f.env,a),pb=await webPersonalLedger(f.env,b);
    assert.notEqual(pa.id,pb.id);assert.equal((await webPersonalLedger(f.env,a)).id,pa.id);
    assert.equal((await (await f.data(a)).json()).transactions.length,0);
    assert.equal((await f.data(b,null,pa.id)).status,403);
    const op={op:'transaction.create',operationId:randomUUID(),transaction:{id:'same-id',type:'expense',date:'2026-10-18',amount:100,title:'web fixture',category:'food'}};
    assert.equal((await f.data(a,op,pa.id)).status,200);
    assert.equal((await f.data(b,op,pb.id)).status,200);
    assert.equal((await f.data(b,{...op,operationId:randomUUID(),transaction:{...op.transaction,id:'foreign-ref',assetId:'asset-in-another-ledger'}},pb.id)).status,422);
    assert.equal((await (await f.data(a)).json()).transactions.length,1);
    assert.equal((await (await f.data(b)).json()).transactions.length,1);
    assert.equal(f.auth.prepare('SELECT COUNT(*) AS n FROM web_personal_ledgers').get().n,2);
    assert.equal((await f.data('anonymous')).status,401);
  }finally{f.close();}
});
test('web shared copy, targeted invitation, viewer writes and revocation stay ledger-scoped',async()=>{
  const f=await fixture();try {
    const [owner,guest,other]=f.users;
    await webPersonalLedger(f.env,owner);
    let r=await f.ledger({action:'create',operationId:randomUUID(),name:'공유 시험',source:'personal'});assert.equal(r.status,200);
    let creation=(await r.json()).creation;
    for(let i=0;creation.status!=='ready'&&i<10;i++){r=await f.ledger({action:'continue',ledgerId:creation.id});assert.equal(r.status,200);creation=(await r.json()).creation;}
    assert.equal(creation.status,'ready');
    r=await f.sharing({action:'create',email:'user1@gmail.com',role:'viewer'},owner,creation.id);assert.equal(r.status,201);const invite=await r.json();
    assert.equal((await f.sharing({action:'accept',token:invite.token},other)).status,403);
    assert.equal((await f.sharing({action:'accept',token:invite.token},guest)).status,200);
    assert.equal((await f.data(guest,null,creation.id)).status,200);
    assert.equal((await f.data(guest,{op:'settings.update',settings:{}},creation.id)).status,403);
    assert.equal((await f.sharing({action:'remove',userId:guest},owner,creation.id)).status,200);
    assert.equal((await f.data(guest,null,creation.id)).status,403);
  }finally{f.close();}
});
test('enabled web routes fail closed on missing bindings/marker and reject whole snapshot writes',async()=>{
  const f=await fixture();try {
    assert.equal((await onRequestGet({request:f.request(),env:{...f.env,WEB_FINANCE:undefined}})).status,503);
    assert.equal((await onRequestPost({request:f.request(undefined,{},undefined,'/api/data','POST'),env:f.env})).status,405);
    f.finance.exec('DELETE FROM web_finance_environment');
    assert.equal((await sharedWalletContext(f.request(),f.env)).status,503);
    assert.equal((await onRequestGet({request:f.request(),env:{...f.env,AUTH_ENABLED:'false'}})).status,503);
  }finally{f.close();}
});
