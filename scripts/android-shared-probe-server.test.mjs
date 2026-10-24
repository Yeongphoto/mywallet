import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { startBundleFixture } from './bundle-probe-fixture.mjs';

test('in-memory Android fixture supports account-first onboarding, shared creation, invitation, and cross-account reads', async () => {
  const fixture = await startBundleFixture({ sharedWallet: true, port:0 });
  const origin = fixture.origin;
  const cookieFrom = (response, name) => response.headers.getSetCookie().find(value => value.startsWith(name + '='))?.split(';', 1)[0];
  async function login(token) {
    const challenge = await fetch(origin + '/api/auth/challenge', { method:'POST', headers:{Origin:origin} });
    assert.equal(challenge.status, 200);
    const challengeCookie = cookieFrom(challenge, 'mywallet-dev-login-state');
    assert(challengeCookie);
    const signed = await fetch(origin + '/api/auth/google', { method:'POST', headers:{Origin:origin,Cookie:challengeCookie,'Content-Type':'application/json'}, body:JSON.stringify({idToken:token}) });
    assert.equal(signed.status, 200);
    const session = cookieFrom(signed, 'mywallet-dev-session');
    assert(session);
    return session;
  }
  async function api(session, path, { method='GET', body, ledger } = {}) {
    const response = await fetch(origin + path, { method, headers:{Cookie:session,...(method!=='GET'?{Origin:origin,'Content-Type':'application/json'}:{}),...(ledger?{'X-Memoney-Ledger':ledger}:{})}, ...(body?{body:JSON.stringify(body)}:{}) });
    return { response, data:await response.json() };
  }
  try {
    const owner = await login('isolated-probe-token');
    const pending = await api(owner, '/api/wallet/onboarding');
    assert.equal(pending.data.status, 'pending');
    const completed = await api(owner, '/api/wallet/onboarding', {method:'POST',ledger:pending.data.ledger.id,body:{snapshot:null}});
    assert.equal(completed.data.status, 'complete');
    assert.equal((await api(owner, '/api/wallet/context')).data.ledger.kind, 'personal');
    const personalData=await api(owner,'/api/data',{ledger:pending.data.ledger.id});
    assert.equal(personalData.response.status,200,JSON.stringify(personalData.data));

    const creation = await api(owner, '/api/wallet/ledgers', {method:'POST',body:{action:'create',name:'Fixture shared ledger',source:'empty',operationId:randomUUID()}});
    assert.equal(creation.response.status, 200);
    let progress = creation.data.creation;
    for (let attempt=0; progress.status!=='ready'&&attempt<3; attempt++) {
      progress=(await api(owner,'/api/wallet/ledgers',{method:'POST',body:{action:'continue',ledgerId:progress.id}})).data.creation;
    }
    assert.equal(progress.status,'ready');
    const sharedId=progress.id;
    assert.equal((await api(owner,'/api/wallet/context',{ledger:sharedId})).data.ledger.role,'owner');

    const transaction={id:randomUUID(),type:'expense',date:'2026-10-24',amount:1350,title:'Memory fixture row',category:'food',time:null,assetId:null,toAssetId:null};
    const created=await api(owner,'/api/data',{method:'PATCH',ledger:sharedId,body:{op:'transaction.create',operationId:randomUUID(),transaction}});
    assert.equal(created.response.status,200,JSON.stringify(created.data));
    const invitation=await api(owner,'/api/wallet/sharing',{method:'POST',ledger:sharedId,body:{action:'create',ledgerId:sharedId,email:'invitee@gmail.com',role:'editor'}});
    assert.equal(invitation.response.status,201);

    const invitee=await login('isolated-invitee-token');
    const inviteePending=await api(invitee,'/api/wallet/onboarding');
    assert.equal(inviteePending.data.status,'pending');
    const inviteeReady=await api(invitee,'/api/wallet/onboarding',{method:'POST',ledger:inviteePending.data.ledger.id,body:{snapshot:null}});
    assert.equal(inviteeReady.data.status,'complete');
    const inviteInbox=await api(invitee,'/api/wallet/sharing');
    assert.equal(inviteInbox.data.receivedInvitations.length,1);
    assert.equal(inviteInbox.data.receivedInvitations[0].id,invitation.data.id);
    const accepted=await api(invitee,'/api/wallet/sharing',{method:'POST',body:{action:'accept',invitationId:invitation.data.id}});
    assert.equal(accepted.data.accepted,true);
    const context=await api(invitee,'/api/wallet/context',{ledger:sharedId});
    assert.equal(context.response.status,200,JSON.stringify(context.data));
    assert.equal(context.data.ledger.role,'editor');
    const sharedData=await api(invitee,'/api/data',{ledger:sharedId});
    assert.equal(sharedData.data.transactions.find(row=>row.id===transaction.id)?.title,'Memory fixture row');
    assert.equal(fixture.metrics.financialWrites,1);
    assert.equal(fixture.metrics.financialReads,2);
    assert.equal(fixture.metrics.financeRows,0);
  } finally { await fixture.close(); }
});
