import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,defaultViewport:{width:411,height:914}});
try {
  const page=await browser.newPage(), ledgerId=crypto.randomUUID(), personalId=crypto.randomUUID(), ownerId=crypto.randomUUID(), guestId=crypto.randomUUID(), token='a'.repeat(64);
  let owner=true, accepted=false, wrong=false, invitation=null, financialWrites=0, sessionReads=0;
  await page.setRequestInterception(true);
  page.on('request',request=>{
    const path=new URL(request.url()).pathname;
    if(!path.startsWith('/api/')) return void request.continue();
    if(path==='/api/data' && request.method()!=='GET') financialWrites++;
    let status=200, data={};
    if(path==='/api/wallet/sharing') {
      if(request.method()==='GET') data={user:{id:owner?ownerId:guestId,email:owner?'owner@gmail.com':'guest@gmail.com'},ledger:owner?{id:ledgerId,role:'owner'}:null,
        personalLedger:{id:personalId,name:'개인 장부'},
        members:owner?[{id:ownerId,email:'owner@gmail.com',role:'owner'}]:[],invitations:invitation?[invitation]:[]};
      else {
        const body=JSON.parse(request.postData());
        if(body.action==='create') { invitation={id:crypto.randomUUID(),email:body.email,role:body.role,expiresAt:Date.now()+86400000};
          data={link:`http://localhost:5187/sharing#invite=${token}`,token}; status=201; }
        if(body.action==='preview') { if(wrong){status=403;data={error:'INVITATION_ACCOUNT_MISMATCH'};}else data={ledger:{name:'공유 장부',role:'editor'}}; }
        if(body.action==='accept') {accepted=true;data={accepted:true};}
      }
    } else if(path==='/api/auth/config') data={enabled:true,clientId:'test.apps.googleusercontent.com'};
    else if(path==='/api/auth/session') { sessionReads++; data={user:{id:guestId}}; }
    else if(path==='/api/wallet/context') data={user:{id:guestId},ledger:{id:ledgerId,role:'editor'},mode:'shared-web'};
    else if(path==='/api/data') data={transactions:[],assets:[],plans:[],recurringRules:[],cardSettlements:[],deletedRecurringTxs:[],cursor:0};
    void request.respond({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('http://localhost:5187/sharing'); await page.waitForSelector('input[aria-label="초대할 Google 계정"]');
  await page.type('input[aria-label="초대할 Google 계정"]','guest@gmail.com');
  await page.evaluate(()=>document.querySelector('input[aria-label="초대할 Google 계정"]').closest('form').requestSubmit());
  await page.waitForSelector('input[aria-label="초대 링크"]');
  assert((await page.$eval('input[aria-label="초대 링크"]',e=>e.value)).includes(token));
  await page.screenshot({path:'android/build/sharing-owner-ui.png'});
  owner=false; wrong=true;
  await page.goto('about:blank');
  await page.goto('http://localhost:5187/sharing'); await page.waitForSelector('input[aria-label="받은 초대 링크"]');
  await page.type('input[aria-label="받은 초대 링크"]',token);
  assert.equal(await page.evaluate(()=>location.hash),'');
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='초대 확인').click());
  await page.waitForFunction(()=>document.querySelector('.sharing-notice')?.textContent.includes('초대받은'));
  assert.equal(accepted,false); wrong=false;
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='초대 확인').click());
  await page.waitForSelector('.sharing-preview'); await page.screenshot({path:'android/build/sharing-accept-ui.png'});
  for(const width of [320,411,768]) {await page.setViewport({width,height:914});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await Promise.all([page.waitForNavigation(),page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='참여').click())]);
  assert.equal(accepted,true); assert.equal(financialWrites,0);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('memoney:pending-invite:v1')),null);
  await page.goto('http://localhost:5187/signin?join=1&reauth=1'); await page.waitForSelector('.signin-google');
  assert.equal(new URL(page.url()).pathname,'/signin'); assert.equal(sessionReads,0,'Reauthentication must request Google credentials instead of reusing the old session');
  console.log(JSON.stringify({create:true,wrongAccountBlocked:true,explicitAcceptance:true,tokenRemovedFromAddress:true,reauthenticationDoesNotLoop:true,financialWrites,viewportWidths:3}));
} finally {await browser.close();}
