import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createSession } from '../server/auth/store.ts';
import { handleMembership } from '../server/billing/membership.ts';
import { handleAccountManagement } from '../server/billing/account-management.ts';
import { monetizationPolicyForAccounts } from '../server/billing/policy.ts';
const admin='18f5a8d3-2561-4083-bbac-2ffb67f15da6',tester='76ba00da-b386-4464-b857-c446d587ed6f',other='11111111-1111-4111-8111-111111111111';
const origin='http://localhost:5187',schema=readFileSync(new URL('./account-membership-schema.sql',import.meta.url),'utf8');
async function fixture(t){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec(readFileSync(new URL('./auth-foundation-schema.sql',import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('./ledger-invitations-schema.sql',import.meta.url),'utf8'));
  for(const [id,email] of [[admin,'admin@example.invalid'],[tester,'tester@example.invalid'],[other,'new@example.invalid']]){
    sql.prepare('INSERT INTO users VALUES(?,?,?)').run(id,'active',Date.now());
    sql.prepare('INSERT INTO auth_identity_profiles VALUES(?,?,?,?)').run(id,email,1,Date.now());
  }
  sql.exec(schema);
  const db={prepare(query){let values=[];return {bind(...args){values=args;return this;},async first(){return sql.prepare(query).get(...values)||null;},async run(){return sql.prepare(query).run(...values);}};},
    async batch(statements){sql.exec('BEGIN');try{for(const statement of statements)await statement.run();sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}}};
  const sessions={};for(const id of [admin,tester,other])sessions[id]=(await createSession(db,id)).token;
  const env={DB:db,AUTH_ENABLED:'true',AUTH_LOCAL_DEV:'true',AUTH_ORIGIN:origin,AUTH_GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',ACCOUNT_MANAGEMENT_ENABLED:'true'};
  const request=(id=admin,body,headers={})=>new Request(origin+'/api/account/manage',{method:body===undefined?'GET':'POST',headers:{Cookie:'mywallet-dev-session='+(sessions[id]||''),Origin:origin,'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const membership=id=>handleMembership(new Request(origin+'/api/account/membership',{headers:{Cookie:'mywallet-dev-session='+sessions[id]}}),env).then(r=>r.json());
  return {sql,db,env,request,membership};
}
test('initial admin/tester membership is server-owned without purchase activation',async t=>{
  const f=await fixture(t);assert.equal((await f.membership(admin)).plan,'premium_admin');assert.equal((await f.membership(tester)).plan,'premium_tester');assert.equal((await f.membership(other)).premium,false);
  const list=await handleAccountManagement(f.request(),f.env);assert.equal(list.status,200);assert.equal((await list.json()).grants.length,1);
  assert.equal((await handleMembership(f.request('',undefined),f.env)).status,401);
});
test('only authenticated super account can list or change grants; no role self promotion',async t=>{
  const f=await fixture(t);
  for(const id of [tester,other])for(const body of [undefined,{action:'grant',email:'new@example.invalid'}])assert.equal((await handleAccountManagement(f.request(id,body),f.env)).status,403);
  assert.equal((await handleAccountManagement(f.request('',undefined),f.env)).status,401);
  assert.equal((await handleAccountManagement(f.request(admin,{action:'grant',email:'new@example.invalid'},{Origin:'https://evil.invalid'}),f.env)).status,403);
  for(const body of [{action:'grant',email:'new@example.invalid',role:'premium_admin'},{action:'grant',userId:other},{action:'grant',email:'admin@example.invalid'}]){
    assert([400,409].includes((await handleAccountManagement(f.request(admin,body),f.env)).status));
  }
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM account_premium_audit').get().n,0);
});
test('grant, revoke and regrant survive schema replay and remain independent of finance/Play',async t=>{
  const f=await fixture(t);
  assert.equal((await handleAccountManagement(f.request(admin,{action:'grant',email:' NEW@EXAMPLE.INVALID '}),f.env)).status,200);
  assert.equal((await f.membership(other)).plan,'premium_tester');
  assert.equal((await handleAccountManagement(f.request(admin,{action:'revoke',userId:tester}),f.env)).status,200);
  f.sql.exec(schema);assert.equal((await f.membership(tester)).premium,false,'schema replay never resurrects a revoked tester');
  assert.equal((await handleAccountManagement(f.request(admin,{action:'grant',email:'tester@example.invalid'}),f.env)).status,200);
  assert.equal((await f.membership(tester)).plan,'premium_tester');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM account_premium_audit').get().n,3);
});
test('unknown/unverified accounts, malformed bodies and disabled management fail safely',async t=>{
  const f=await fixture(t);f.sql.prepare('UPDATE auth_identity_profiles SET authoritative=0 WHERE user_id=?').run(other);
  for(const email of ['new@example.invalid','unknown@example.invalid'])assert.equal((await handleAccountManagement(f.request(admin,{action:'grant',email}),f.env)).status,404);
  assert.equal((await handleAccountManagement(f.request(admin,{action:'grant',email:'x'.repeat(5000)}),f.env)).status,400);
  assert.equal((await handleAccountManagement(f.request(),{...f.env,ACCOUNT_MANAGEMENT_ENABLED:'false'})).status,503);
});
test('effective host/guest benefit respects shared ownership and revocation',async t=>{
  const f=await fixture(t),input={actorUserId:other,ledgerOwnerUserId:tester,ledgerAssetCount:20,entriesUsedToday:10,verifiedRewardsToday:0,purchases:[]};
  const first=await monetizationPolicyForAccounts(f.env,input);assert.equal(first.assetLimit,null);assert.equal(first.adsEnabled,true);
  const guest=await monetizationPolicyForAccounts(f.env,{...input,actorUserId:tester,ledgerOwnerUserId:other});assert.equal(guest.assetLimit,10);assert.equal(guest.adsEnabled,false);
  await handleAccountManagement(f.request(admin,{action:'revoke',userId:tester}),f.env);
  assert.equal((await monetizationPolicyForAccounts(f.env,input)).assetLimit,10);
});
test('grant and audit commit together; storage failure never grants membership',async t=>{
  const f=await fixture(t);f.sql.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON account_premium_audit BEGIN SELECT RAISE(ABORT,'fixture'); END");
  assert.equal((await handleAccountManagement(f.request(admin,{action:'grant',email:'new@example.invalid'}),f.env)).status,503);
  assert.equal((await f.membership(other)).premium,false);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM account_premium_grants WHERE user_id=?').get(other).n,0);
});
test('ambiguous verified email never chooses an arbitrary account',async t=>{
  const f=await fixture(t);f.sql.prepare('UPDATE auth_identity_profiles SET email=? WHERE user_id=?').run('tester@example.invalid',other);
  assert.equal((await handleAccountManagement(f.request(admin,{action:'grant',email:'tester@example.invalid'}),f.env)).status,409);
  assert.equal((await f.membership(other)).premium,false);
});
