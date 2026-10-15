import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const origin=process.argv[2] || 'https://memoney-android-test.pages.dev';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
  for(const member of [true,false]) {
    const page=await browser.newPage(), userId=crypto.randomUUID(), ledgerId=crypto.randomUUID();
    let held, resolveContext;
    const requested=new Promise(resolve=>{resolveContext=resolve;});
    await page.setRequestInterception(true);
    page.on('request',request=>{
      const path=new URL(request.url()).pathname;
      if(!path.startsWith('/api/')) return void request.continue();
      if(path==='/api/wallet/context' && !held) {held=request;resolveContext();return;}
      let status=200,data={};
      if(path==='/api/auth/config') data={enabled:true,clientId:'test.apps.googleusercontent.com'};
      else if(path==='/api/auth/session') data={user:{id:userId}};
      else if(path==='/api/wallet/context') {status=member?200:403;data=member?{user:{id:userId},ledger:{id:ledgerId,role:'owner'},mode:'shared-web'}:{error:'LEDGER_ACCESS_DENIED'};}
      else if(path==='/api/wallet/sharing') data={user:{id:userId},receivedInvitations:[]};
      else if(path==='/api/data') data={transactions:[],assets:[],plans:[],recurringRules:[],cardSettlements:[],deletedRecurringTxs:[],cursor:0};
      void request.respond({status,contentType:'application/json',body:JSON.stringify(data)});
    });
    await page.goto(origin+'/signin',{waitUntil:'domcontentloaded'}); await requested;
    // Hold permission resolution to verify every intermediate animation frame.
    const frames=await page.evaluate(()=>new Promise(resolve=>{
      let count=0, accountFrames=0;
      const inspect=()=>{if(document.querySelector('.signin-card') || document.querySelector('.sharing-page'))accountFrames++;
        if(++count<20)requestAnimationFrame(inspect);else resolve({accountFrames,loader:!!document.querySelector('.app-loading-screen')});};
      requestAnimationFrame(inspect);
    }));
    assert.equal(frames.accountFrames,0); assert.equal(frames.loader,true);
    await held.respond({status:member?200:403,contentType:'application/json',body:JSON.stringify(member?
      {user:{id:userId},ledger:{id:ledgerId,role:'owner'},mode:'shared-web'}:{error:'LEDGER_ACCESS_DENIED'})});
    await page.waitForSelector('.app-header');
    assert.equal(new URL(page.url()).pathname,member?'/wallet':'/guest');
    assert.equal(await page.$('.signin-card'),null); await page.close();
  }
  console.log('Existing member and invited account: no account/invitation button frame while permissions resolve; direct home transition.');
} finally {await browser.close();}
