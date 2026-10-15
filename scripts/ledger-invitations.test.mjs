import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleSharing } from '../server/wallet/invitations.ts';
import { sharedWalletContext } from '../server/wallet/shared-web.ts';
import { createSession } from '../server/auth/store.ts';

async function fixture() {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
  for (const path of ['auth-foundation-schema.sql','ledger-invitations-schema.sql']) sqlite.exec(readFileSync(new URL(path, import.meta.url), 'utf8'));
  const db = { prepare(sql) { return { values: [], bind(...values) { this.values = values; return this; },
    async first() { return sqlite.prepare(sql).get(...this.values) || null; }, async run() { return sqlite.prepare(sql).run(...this.values); }, sql }; },
    async batch(statements) { sqlite.exec('BEGIN'); try { const result = statements.map(s => sqlite.prepare(s.sql).run(...s.values)); sqlite.exec('COMMIT'); return result; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  const now = Date.now(), ledgerId = crypto.randomUUID(), users = {};
  for (const [name, email] of [['owner','owner@gmail.com'],['guest','guest@gmail.com'],['other','other@gmail.com']]) {
    const id = crypto.randomUUID(); sqlite.prepare('INSERT INTO users VALUES (?,\'active\',?)').run(id, now);
    sqlite.prepare('INSERT INTO auth_identity_profiles VALUES (?,?,1,?)').run(id,email,now);
    users[name] = { id, cookie: `mywallet-dev-session=${(await createSession(db,id)).token}` };
  }
  sqlite.prepare('INSERT INTO ledgers VALUES (?,?,?,?)').run(ledgerId,users.owner.id,'Fixture ledger',now);
  sqlite.prepare('INSERT INTO ledger_memberships VALUES (?,?,\'owner\',?)').run(ledgerId,users.owner.id,now);
  const env = { DB: db, AUTH_ENABLED:'true', AUTH_GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com', AUTH_LOCAL_DEV:'true', AUTH_ORIGIN:'http://localhost:5187',
    AUTH_LEDGER_INVITES:'true', AUTH_SHARED_WALLET_LEDGER_ID:ledgerId, AUTH_SHARED_WALLET_ORIGIN:'https://mywallet-8mx.pages.dev' };
  const call = (name, body, time = now, origin = env.AUTH_ORIGIN) => handleSharing(new Request(`${env.AUTH_ORIGIN}/api/wallet/sharing`, {
    method: body ? 'POST' : 'GET', headers: { Cookie: users[name]?.cookie || '', Origin: origin, 'Content-Type':'application/json' },
    body: body ? JSON.stringify(body) : undefined }),env,time);
  const create = async (role = 'editor') => { const r = await call('owner',{action:'create',email:'guest@gmail.com',role}); assert.equal(r.status,201); return r.json(); };
  return { sqlite, env, users, now, call, create };
}
test('invitation requires owner and origin; unsigned users and arbitrary roles fail', async () => {
  const f=await fixture(); try {
    assert.equal((await f.call('missing')).status,401);
    assert.equal((await f.call('guest',{action:'create',email:'guest@gmail.com',role:'editor'})).status,403);
    assert.equal((await f.call('owner',{action:'create',email:'guest@gmail.com',role:'owner'})).status,400);
    assert.equal((await f.call('owner',{action:'create',email:'guest@gmail.com',role:'editor'},f.now,'https://attacker.invalid')).status,403);
  } finally { f.sqlite.close(); }
});
test('only token hashes are stored; previews and Google login alone grant no membership', async () => {
  const f=await fixture(); try {
    const invite=await f.create(); assert.match(invite.token,/^[a-f0-9]{64}$/);
    assert.notEqual(f.sqlite.prepare('SELECT token_hash FROM ledger_invitations').get().token_hash,invite.token);
    assert.equal((await f.call('other',{action:'preview',token:invite.token})).status,403);
    assert.equal((await f.call('guest',{action:'preview',token:invite.token})).status,200);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM ledger_memberships').get().n,1);
    assert.equal((await f.call('guest')).status,200);
    assert.equal((await (await f.call('guest')).json()).ledger,null);
  } finally { f.sqlite.close(); }
});
test('target accepts once, retry is idempotent, and existing shared context opens', async () => {
  const f=await fixture(); try {
    const invite=await f.create();
    const results=await Promise.all([f.call('guest',{action:'accept',token:invite.token}),f.call('guest',{action:'accept',token:invite.token})]);
    assert(results.every(r=>r.status===200), JSON.stringify(await Promise.all(results.map(async r=>({status:r.status,body:await r.json()})))));
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM ledger_memberships WHERE user_id=?').get(f.users.guest.id).n,1);
    assert.equal((await f.call('other',{action:'accept',token:invite.token})).status,404);
    const context=await sharedWalletContext(new Request('http://localhost:5187/api/wallet/context',{headers:{Cookie:f.users.guest.cookie}}),f.env);
    assert.equal(context.status,200); assert.equal((await context.json()).ledger.role,'editor');
  } finally { f.sqlite.close(); }
});
test('expired, revoked, reissued and mismatched invitations cannot be accepted', async () => {
  const f=await fixture(); try {
    const old=await f.create(), newer=await f.create();
    assert.equal((await f.call('guest',{action:'accept',token:old.token})).status,404);
    assert.equal((await f.call('other',{action:'accept',token:newer.token})).status,403);
    assert.equal((await f.call('guest',{action:'accept',token:newer.token},newer.expiresAt)).status,404);
    await f.call('owner',{action:'revoke',id:newer.id});
    assert.equal((await f.call('guest',{action:'accept',token:newer.token})).status,404);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM ledger_memberships').get().n,1);
  } finally { f.sqlite.close(); }
});
test('fresh authoritative Google email is required; stale and external claims fail', async () => {
  const f=await fixture(); try {
    const invite=await f.create();
    f.sqlite.prepare('UPDATE auth_identity_profiles SET authoritative=0 WHERE user_id=?').run(f.users.guest.id);
    assert.equal((await f.call('guest',{action:'accept',token:invite.token})).status,401);
    f.sqlite.prepare('UPDATE auth_identity_profiles SET authoritative=1,verified_at=? WHERE user_id=?').run(f.now-600001,f.users.guest.id);
    assert.equal((await f.call('guest',{action:'accept',token:invite.token})).status,401);
  } finally { f.sqlite.close(); }
});
test('viewer cannot manage; removal denies access and cannot reuse accepted link', async () => {
  const f=await fixture(); try {
    const invite=await f.create('viewer'); await f.call('guest',{action:'accept',token:invite.token});
    assert.equal((await f.call('guest',{action:'remove',userId:f.users.owner.id})).status,403);
    assert.equal((await f.call('owner',{action:'remove',userId:f.users.owner.id})).status,409);
    await f.call('owner',{action:'remove',userId:f.users.guest.id});
    const context=await sharedWalletContext(new Request('http://localhost:5187/api/wallet/context',{headers:{Cookie:f.users.guest.cookie}}),f.env);
    assert.equal(context.status,403); assert.equal((await f.call('guest',{action:'accept',token:invite.token})).status,404);
  } finally { f.sqlite.close(); }
});
test('issuance has a per-owner limit and no non-owner invitation target listing', async () => {
  const f=await fixture(); try {
    for(let i=0;i<20;i++) await f.create();
    assert.equal((await f.call('owner',{action:'create',email:'guest@gmail.com',role:'editor'})).status,429);
    assert.deepEqual((await (await f.call('guest')).json()).invitations,[]);
  } finally { f.sqlite.close(); }
});

test('received invitation inbox belongs only to its Google account and accepts by ID', async () => {
  const f=await fixture(); try {
    const invite=await f.create();
    const guest=await (await f.call('guest')).json(), other=await (await f.call('other')).json();
    assert.equal(guest.receivedInvitations.length,1); assert.equal(guest.receivedInvitations[0].id,invite.id);
    assert.deepEqual(other.receivedInvitations,[]);
    assert.equal((await f.call('other',{action:'accept',invitationId:invite.id})).status,403);
    assert.equal((await f.call('guest',{action:'accept',invitationId:invite.id})).status,200);
    assert.deepEqual((await (await f.call('guest')).json()).receivedInvitations,[]);
  } finally {f.sqlite.close();}
});
