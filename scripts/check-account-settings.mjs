import { webUiArtifact } from './web-ui-artifact.mjs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const origin=process.argv[2] || 'https://memoney-android-test.pages.dev';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,defaultViewport:{width:411,height:914}});
try {
  const page=await browser.newPage(), id=crypto.randomUUID();let signedIn=true,logout=0,financialRequests=0,contexts=0;
  await page.setRequestInterception(true);
  page.on('request',request=>{
    const path=new URL(request.url()).pathname;if(!path.startsWith('/api/'))return void request.continue();
    let status=200,data={};
    if(path==='/api/auth/config')data={enabled:true,clientId:'test.apps.googleusercontent.com'};
    else if(path==='/api/auth/session'){status=signedIn?200:401;data=signedIn?{user:{id}}:{error:'UNAUTHENTICATED'};}
    else if(path==='/api/auth/logout'){signedIn=false;logout++;data={success:true};}
    else if(path==='/api/wallet/context'){contexts++;data={user:{id},ledger:{id,role:'owner'},mode:'shared-web'};}
    else if(path==='/api/wallet/sharing')data={user:{id,email:'fixture@gmail.com'},members:[],invitations:[],receivedInvitations:[]};
    else if(path==='/api/data')financialRequests++;
    void request.respond({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(origin+'/guest#settings');
  await page.waitForFunction(()=>document.querySelector('.account-settings-action')?.textContent==='로그아웃');
  assert.equal(await page.$eval('.account-settings-label > span',e=>e.textContent),'fixture@gmail.com');
  const guestId=await page.evaluate(()=>{
    const guestId=localStorage.getItem('memoney:guest:active-id'),key=`memoney:guest:${guestId}:mywallet:v2`;
    const data=JSON.parse(localStorage.getItem(key));data.transactions.push({id:'qa-preserved',type:'expense',date:'2026-10-14',amount:100,title:'Keep local record',category:'food',revision:1});
    localStorage.setItem(key,JSON.stringify(data));return guestId;
  });
  for(const width of [320,411,768]){await page.setViewport({width,height:914});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.setViewport({width:411,height:914});await page.screenshot({path:webUiArtifact('account-signed-in.png')});
  await Promise.all([page.waitForNavigation(),page.click('.account-settings-action')]);
  await page.waitForFunction(()=>document.querySelector('.account-settings-action')?.textContent==='Google 로그인');
  assert.equal(logout,1);assert.equal(new URL(page.url()).pathname,'/guest');
  assert.equal(await page.evaluate(()=>localStorage.getItem('memoney:guest:active-id')),guestId);
  assert.equal(await page.evaluate(id=>JSON.parse(localStorage.getItem(`memoney:guest:${id}:mywallet:v2`)).transactions[0].title,guestId),'Keep local record');
  signedIn=true;
  await Promise.all([page.waitForNavigation(),page.click('.account-settings-action')]);
  await page.waitForFunction(()=>document.querySelector('.account-settings-action')?.textContent==='로그아웃');
  assert.equal(new URL(page.url()).pathname,'/guest');assert.equal(contexts,0);assert.equal(financialRequests,0);
  console.log(JSON.stringify({accountVisible:true,localLogout:true,localRecordsPreserved:true,loginKeepsLocalMode:true,financialRequests}));
}finally{await browser.close();}
