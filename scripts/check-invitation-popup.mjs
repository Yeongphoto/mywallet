import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const origin=process.argv[2] || 'https://memoney-android-test.pages.dev';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,defaultViewport:{width:411,height:914}});
try {
  const page=await browser.newPage(), userId=crypto.randomUUID(), ledgerId=crypto.randomUUID(), inviteId=crypto.randomUUID();
  let member=false, accepts=0, sharingPageLoads=0, financialWrites=0;
  await page.setRequestInterception(true);
  page.on('request',request=>{
    const path=new URL(request.url()).pathname;
    if(path==='/sharing' && request.isNavigationRequest()) sharingPageLoads++;
    if(!path.startsWith('/api/')) return void request.continue();
    if(path==='/api/data' && request.method()!=='GET') financialWrites++;
    let status=200,data={};
    if(path==='/api/auth/config') data={enabled:true,clientId:'test.apps.googleusercontent.com'};
    else if(path==='/api/auth/session') data={user:{id:userId}};
    else if(path==='/api/wallet/context') { status=member?200:403; data=member?{user:{id:userId},ledger:{id:ledgerId,role:'editor'},mode:'shared-web'}:{error:'LEDGER_ACCESS_DENIED'}; }
    else if(path==='/api/wallet/sharing') {
      if(request.method()==='GET') data={user:{id:userId,email:'guest@gmail.com'},ledger:member?{id:ledgerId,role:'editor'}:null,members:[],invitations:[],
        receivedInvitations:member?[]:[{id:inviteId,name:'Shared wallet',role:'editor',expiresAt:Date.now()+86400000}]};
      else { const body=JSON.parse(request.postData());assert.equal(body.action,'accept');assert.equal(body.invitationId,inviteId);accepts++;member=true;data={accepted:true}; }
    } else if(path==='/api/data') data={transactions:[],assets:[],plans:[],recurringRules:[],cardSettlements:[],deletedRecurringTxs:[],cursor:0};
    void request.respond({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(origin+'/signin'); await page.waitForSelector('.received-invitation-card');
  assert.equal(new URL(page.url()).pathname,'/guest'); assert(await page.$('.app-header'));
  assert.equal(await page.$('.sharing-page'),null); assert.equal(sharingPageLoads,0); assert.equal(accepts,0);
  assert.equal(await page.$eval('.app-header',e=>e.closest('[inert]')!==null),true);
  await page.screenshot({path:'android/build/invitation-home-popup.png'});
  for(const width of [320,411,768]) { await page.setViewport({width,height:914}); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false); }
  await page.evaluate(()=>[...document.querySelectorAll('.received-invitation-card button')].find(b=>b.textContent==='나중에').click());
  assert.equal(accepts,0); await page.waitForFunction(()=>!document.querySelector('.received-invitation-card'));
  assert.equal(await page.$eval('.app-header',e=>e.closest('[inert]')!==null),false);
  await page.reload(); await page.waitForSelector('.received-invitation-card');
  await Promise.all([page.waitForNavigation(),page.evaluate(()=>[...document.querySelectorAll('.received-invitation-card button')].find(b=>b.textContent==='참여').click())]);
  assert.equal(new URL(page.url()).pathname,'/wallet'); assert.equal(accepts,1); assert.equal(financialWrites,0);
  member=false;
  await page.goto(origin+'/sharing#invite='+'a'.repeat(64));
  await page.waitForSelector('.received-invitation-card');
  assert.equal(new URL(page.url()).pathname,'/guest'); assert.equal(await page.$('.sharing-page'),null);
  assert.equal(await page.evaluate(()=>location.hash),'');
  assert.equal(accepts,1,'An incoming link must not join a ledger automatically');
  console.log(JSON.stringify({homeBeforeInvite:true,noManagementPageDuringStartup:true,laterKeepsMembershipUnchanged:true,explicitJoin:true,financialWrites,widths:3}));
} finally {await browser.close();}
