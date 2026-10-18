import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createSession } from '../server/auth/store.ts';
import { sharedWalletConfiguration, sharedWalletContext, sharedWalletData } from '../server/wallet/shared-web.ts';
import { onRequestGet, onRequestPatch } from '../functions/api/data.ts';

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('./auth-foundation-schema.sql', import.meta.url), 'utf8'));
  const owner = randomUUID(), viewer = randomUUID(), outsider = randomUUID(), ledger = randomUUID();
  for (const id of [owner, viewer, outsider]) sqlite.prepare('INSERT INTO users VALUES (?, ?, ?)').run(id, 'active', 1);
  sqlite.prepare('INSERT INTO ledgers VALUES (?, ?, ?, ?)').run(ledger, owner, 'Shared wallet', 1);
  for (const [id, role] of [[owner, 'owner'], [viewer, 'viewer']]) sqlite.prepare('INSERT INTO ledger_memberships VALUES (?, ?, ?, ?)').run(ledger, id, role, 1);
  const db = { prepare(sql) { return { values: [], bind(...values) { this.values = values; return this; },
    async first() { return sqlite.prepare(sql).get(...this.values) ?? null; }, async run() { return sqlite.prepare(sql).run(...this.values); } }; } };
  const cookies = {};
  for (const id of [owner, viewer, outsider]) cookies[id] = `mywallet-dev-session=${(await createSession(db,id)).token}`;
  const env = { DB:db, AUTH_ENABLED:'true', AUTH_GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com', AUTH_ORIGIN:'http://localhost:5187', AUTH_LOCAL_DEV:'true',
    AUTH_SHARED_WALLET_ORIGIN:'https://mywallet-8mx.pages.dev', AUTH_SHARED_WALLET_LEDGER_ID:ledger };
  const request = (user = owner, method = 'GET', suffix = '', body, origin = env.AUTH_ORIGIN) => new Request(`${env.AUTH_ORIGIN}/api/data${suffix}`, {
    method, headers:{Cookie:cookies[user] || '', Origin:origin, 'Content-Type':'application/json'}, body,
  });
  return { sqlite, env, owner, viewer, outsider, ledger, request };
}

test('shared wallet checks session and membership before contacting the existing API', async () => {
  const f = await fixture(); let calls = 0;
  const upstream = async () => { calls++; return Response.json({ transactions:[] }); };
  try {
    assert.equal((await sharedWalletData(f.request('anonymous'),f.env,upstream)).status,401);
    assert.equal((await sharedWalletData(f.request(f.outsider),f.env,upstream)).status,403);
    assert.equal((await sharedWalletData(f.request(),{...f.env,AUTH_SHARED_WALLET_ORIGIN:undefined},upstream)).status,503);
    assert.equal((await sharedWalletData(f.request(),{...f.env,AUTH_SHARED_WALLET_ORIGIN:'http://127.0.0.1'},upstream)).status,503);
    assert.equal((await sharedWalletData(f.request(),{...f.env,AUTH_LOCAL_DEV:'false'},upstream)).status,503);
    assert.equal(calls,0);
    const context = await (await sharedWalletContext(f.request(),f.env)).json();
    assert.equal(context.user.id,f.owner); assert.equal(context.ledger.id,f.ledger); assert.equal(context.mode,'shared-web');
    f.sqlite.prepare('DELETE FROM ledger_memberships WHERE user_id = ?').run(f.owner);
    assert.equal((await sharedWalletData(f.request(),f.env,upstream)).status,403); assert.equal(calls,0);
  } finally {f.sqlite.close();}
});

test('hosted bridge requires the explicit test deployment and exact HTTPS origin', async () => {
  const f = await fixture();
  try {
    const hosted = {...f.env,AUTH_LOCAL_DEV:'false',AUTH_ORIGIN:'https://memoney-android-test.pages.dev'};
    assert.equal(sharedWalletConfiguration(hosted),null);
    const enabled={...hosted,AUTH_SHARED_TEST_DEPLOYMENT:'true'};
    assert.equal(sharedWalletConfiguration(enabled).ledgerId,f.ledger);
    assert.equal(sharedWalletConfiguration({...enabled,AUTH_ORIGIN:'https://attacker.invalid'}),null);
    const source=f.request();
    const headers=new Headers(source.headers); headers.set('Cookie',headers.get('Cookie').replace('mywallet-dev-session=','__Host-mywallet-session='));
    headers.set('Origin',enabled.AUTH_ORIGIN);
    const request=new Request(enabled.AUTH_ORIGIN+'/api/data',{headers});
    let calls=0;
    const response=await sharedWalletData(request,enabled,async()=>{calls++;return Response.json({transactions:[]});});
    assert.equal(response.status,200); assert.equal(calls,1);
  } finally {f.sqlite.close();}
});

test('shared wallet forwards only the fixed data endpoint and valid incremental cursor', async () => {
  const f = await fixture(); const calls = [];
  const upstream = async (url,init) => {calls.push({url:String(url),init}); return Response.json({changes:[],nextCursor:7});};
  try {
    const response = await sharedWalletData(f.request(f.owner,'GET','?after=7'),f.env,upstream);
    assert.equal(response.status,200); assert.equal(response.headers.get('Cache-Control'),'no-store');
    assert.equal(calls[0].url,'https://mywallet-8mx.pages.dev/api/data?after=7');
    assert.equal(calls[0].init.headers.get('Cookie'),null); assert.equal(calls[0].init.credentials,'omit'); assert.equal(calls[0].init.redirect,'manual');
    assert.equal(calls[0].init.headers.get('Cache-Control'),'no-cache');
    for (const query of ['?after=-1','?after=1.2','?after=9007199254740992','?target=https://attacker.invalid','?ledger=other']) {
      assert.equal((await sharedWalletData(f.request(f.owner,'GET',query),f.env,upstream)).status,400);
    }
    assert.equal(calls.length,1);
    assert.equal((await sharedWalletData(f.request(f.viewer),f.env,upstream)).status,200);
  } finally {f.sqlite.close();}
});

test('shared wallet preserves UTF-8 operations and conflict responses without forwarding session secrets', async () => {
  const f = await fixture(); const operation = JSON.stringify({op:'transaction.update',operationId:randomUUID(),expectedRevision:3,transaction:{title:'웹앱과 함께 쓰는 기록',amount:100}});
  let calls=0;
  const upstream = async (url,init) => {
    calls++; assert.equal(String(url),'https://mywallet-8mx.pages.dev/api/data');
    assert.equal(init.method,'PATCH'); assert.equal(await new Response(init.body).text(),operation);
    assert.equal(init.headers.get('Origin'),f.env.AUTH_SHARED_WALLET_ORIGIN); assert.equal(init.headers.get('Cookie'),null);
    return Response.json({error:'REVISION_CONFLICT',current:{revision:4}}, {status:409,headers:{'Set-Cookie':'upstream-secret=value'}});
  };
  try {
    const response = await sharedWalletData(f.request(f.owner,'PATCH','',operation),f.env,upstream);
    assert.equal(response.status,409); assert.equal((await response.json()).current.revision,4); assert.equal(response.headers.get('Set-Cookie'),null);
    assert.equal((await sharedWalletData(f.request(f.viewer,'PATCH','',operation),f.env,upstream)).status,403);
    assert.equal((await sharedWalletData(f.request(f.owner,'PATCH','',operation,'https://attacker.invalid'),f.env,upstream)).status,403);
    assert.equal((await sharedWalletData(f.request(f.owner,'POST','',operation),f.env,upstream)).status,405);
    assert.equal(calls,1);
  } finally {f.sqlite.close();}
});

test('shared wallet hides failed upstream responses and does not expose a false empty wallet', async () => {
  const f = await fixture();
  try {
    const unavailable=await sharedWalletData(f.request(),f.env,async()=>new Response('<html>unavailable</html>'));
    assert.equal(unavailable.status,502); assert.deepEqual(await unavailable.json(),{error:'WALLET_UPSTREAM_UNAVAILABLE'});
    assert.equal((await sharedWalletData(f.request(),f.env,async()=>{throw Error('private details');})).status,502);
    assert.equal((await sharedWalletData(f.request(),f.env,async()=>Response.redirect('https://attacker.invalid'))).status,502);
  } finally {f.sqlite.close();}
});

test('Android and the existing web handler share saves, revision conflicts, retries and deletion', async () => {
  const f = await fixture(), finance = new DatabaseSync(':memory:');
  finance.exec(readFileSync(new URL('./android-sandbox-schema.sql',import.meta.url),'utf8'));
  const db = {prepare(sql){return {sql,values:[],bind(...values){this.values=values;return this;},
    async first(){return finance.prepare(sql).get(...this.values)??null;},
    async all(){return {results:finance.prepare(sql).all(...this.values)};},
    async run(){return {success:true,meta:{changes:finance.prepare(sql).run(...this.values).changes}};}};},
    async batch(statements){finance.exec('BEGIN');try{
      const results=statements.map(s=>({success:true,meta:{changes:finance.prepare(s.sql).run(...s.values).changes}}));
      finance.exec('COMMIT');return results;
    }catch(error){finance.exec('ROLLBACK');throw error;}}};
  const web = request => (request.method==='GET'?onRequestGet:onRequestPatch)({request,env:{DB:db}});
  const upstream = (url,options) => web(new Request(url,{...options,duplex:'half'}));
  const android = body => sharedWalletData(f.request(f.owner,'PATCH','',JSON.stringify(body)),f.env,upstream);
  const browser = body => web(new Request('https://mywallet-8mx.pages.dev/api/data',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
  const read = () => sharedWalletData(f.request(),f.env,upstream).then(r=>r.json());
  const transaction={id:randomUUID(),type:'expense',date:'2026-10-13',amount:100,title:'동시 사용 시험',category:'food',createdAt:Date.now()};
  try {
    const create={op:'transaction.create',operationId:randomUUID(),transaction};
    assert.equal((await android(create)).status,200);
    assert.equal((await android(create)).status,200);
    const webSnapshot=await (await web(new Request('https://mywallet-8mx.pages.dev/api/data'))).json();
    assert.equal(webSnapshot.transactions.length,1);assert.equal(webSnapshot.transactions[0].title,transaction.title);
    assert.equal((await browser({op:'transaction.update',operationId:randomUUID(),expectedRevision:1,transaction:{...transaction,amount:200}})).status,200);
    const conflict=await android({op:'transaction.update',operationId:randomUUID(),expectedRevision:1,transaction:{...transaction,amount:300}});
    assert.equal(conflict.status,409);assert.equal((await conflict.json()).current.transaction.revision,2);
    const update={op:'transaction.update',operationId:randomUUID(),expectedRevision:2,transaction:{...transaction,amount:300}};
    assert.equal((await android(update)).status,200);assert.equal((await android(update)).status,200);
    assert.equal((await read()).transactions[0].revision,3);
    assert.equal((await read()).transactions[0].amount,300);
    const delta=await (await sharedWalletData(f.request(f.owner,'GET','?after=0'),f.env,upstream)).json();
    assert(delta.changes.some(change=>change.revision===3));
    assert.equal((await browser({op:'transaction.delete',operationId:randomUUID(),transactionId:transaction.id,expectedRevision:3})).status,200);
    assert.equal((await read()).transactions.length,0);
    const deleted=await (await sharedWalletData(f.request(f.owner,'GET',`?after=${delta.nextCursor}`),f.env,upstream)).json();
    assert(deleted.changes.some(change=>change.entityId===transaction.id&&change.changeType==='delete'));
  } finally {finance.close();f.sqlite.close();}
});
