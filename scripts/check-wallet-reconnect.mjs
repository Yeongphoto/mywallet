import puppeteer from 'puppeteer-core';
import {createServer} from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Only local fixture responses are used. No account or financial server is contacted.
const root=path.resolve('dist');
const types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'};
const server=createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 let file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(root,'index.html');
 res.setHeader('Content-Type',types[path.extname(file)]||'text/html');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
if(process.argv.includes('--serve')){
 console.log(`Temporary offline preview: ${origin}/wallet`);
 await new Promise(resolve=>setTimeout(resolve,60000));
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));process.exit(0);
}
console.log('Starting local browser recovery checks.');
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const scope={user:{id:'11111111-1111-4111-8111-111111111111'},ledger:{id:'22222222-2222-4222-8222-222222222222',role:'owner',kind:'personal',name:'Fixture'},mode:'shared-web'};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let checks=0;
async function fixture(mode='ok'){
 console.log(`Checking fixture: ${mode}`);
 const context=await browser.createBrowserContext(),page=await context.newPage();await page.setViewport({width:411,height:900});
 page.setDefaultTimeout(10000);
 const state={mode,dataFails:0,calls:0,active:0,peak:0,writes:0,expired:false,logoutFails:false,delay:0,successful:0};
 await page.setRequestInterception(true);
 page.on('request',async request=>{
  const url=new URL(request.url());if(url.origin!==origin){await request.abort();return;}
  if(!url.pathname.startsWith('/api/')){await request.continue();return;}
  let data={},status=200;
  if(request.method()!=='GET')state.writes++;
  if(url.pathname==='/api/wallet/context'){
   state.calls++;state.active++;state.peak=Math.max(state.peak,state.active);
   if(state.delay)await sleep(state.delay);
   const current=state.mode;
   if(current==='network'){state.active--;await request.abort('failed');return;}
   if(current==='expired'){status=401;data={error:'UNAUTHENTICATED'};state.expired=true;}
   else if(current==='server'){status=503;data={error:'WALLET_UNAVAILABLE'};}
   else{data=scope;state.successful++;}
   state.active--;
  }else if(url.pathname==='/api/data'){
   if(state.dataFails-->0){status=503;data={error:'WALLET_UNAVAILABLE'};}
   else data={transactions:[],assets:[],plans:[],recurringRules:[],deletedRecurringTxs:[],budget:500000,updatedAt:1234};
  }else if(url.pathname==='/api/auth/config')data={enabled:true,clientId:'fixture.apps.googleusercontent.com'};
  else if(url.pathname==='/api/auth/session'){status=state.expired?401:200;data=state.expired?{error:'UNAUTHENTICATED'}:{user:scope.user};}
  else if(url.pathname==='/api/auth/logout'){status=state.logoutFails?503:200;data={success:status===200};if(status===200)state.expired=true;}
  else if(url.pathname==='/api/wallet/ledgers')data={ledgers:[scope.ledger]};
  await request.respond({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 return {page,state,close:()=>context.close()};
}
try{
 for(const mode of ['network','server']){
  const f=await fixture(mode);await f.page.goto(origin+'/wallet');await f.page.waitForSelector('.wallet-connection-status');
  assert.equal(await f.page.$('.app-header'),null);assert(!await f.page.$eval('.wallet-connection-status',e=>e.textContent.includes('로그인')));
  f.state.mode='ok';await f.page.evaluate(()=>window.dispatchEvent(new Event('online')));await f.page.waitForSelector('.app-header');await f.page.waitForSelector('.app-loading-screen',{hidden:true});
  assert(new URL(f.page.url()).pathname==='/wallet');assert.equal(f.state.writes,0);checks++;await f.close();
 }
 {
  const f=await fixture();f.state.dataFails=2;await f.page.goto(origin+'/wallet');await f.page.waitForSelector('.wallet-connection-status');assert.equal(await f.page.$('.app-header'),null);
  f.state.dataFails=0;await f.page.evaluate(()=>window.dispatchEvent(new Event('online')));await f.page.waitForSelector('.app-header');assert.equal(f.state.writes,0);checks++;await f.close();
 }
 {
  const f=await fixture();await f.page.goto(origin+'/wallet');await f.page.waitForSelector('.app-header');await f.page.waitForSelector('.app-loading-screen',{hidden:true});
  await f.page.click('.mobile-primary-action');await f.page.waitForSelector('.entry-modal');await f.page.type('.content-entry-field input','아직 저장하지 않은 내용');
  await f.page.evaluate(()=>window.originalEntry=document.querySelector('.entry-modal'));
  f.state.mode='network';f.state.delay=150;f.state.peak=0;
  const before=f.state.calls;
  await f.page.evaluate(()=>{window.dispatchEvent(new Event('pageshow'));window.dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'));});
  await sleep(500);assert(f.state.calls>before);assert.equal(f.state.peak,1);
  assert(await f.page.evaluate(()=>document.querySelector('.entry-modal')===window.originalEntry));
  assert.equal(await f.page.$eval('.content-entry-field input',e=>e.value),'아직 저장하지 않은 내용');
  const successful=f.state.successful;f.state.mode='ok';await sleep(1700);assert(f.state.successful>successful);
  assert(await f.page.evaluate(()=>document.querySelector('.entry-modal')===window.originalEntry));
  assert.equal(f.state.writes,0);
  await sleep(300);f.state.mode='expired';await f.page.evaluate(()=>window.dispatchEvent(new Event('online')));
  try{await f.page.waitForSelector('.signin-local');}catch(error){throw new Error(JSON.stringify({state:f.state,url:f.page.url(),body:await f.page.$eval('body',e=>e.innerText.slice(-700)),visibility:await f.page.evaluate(()=>document.visibilityState)}),{cause:error});}
  assert.equal(new URL(f.page.url()).pathname,'/signin');
  checks+=2;await f.close();
 }
 {
  const f=await fixture('expired');await f.page.goto(origin+'/wallet');await f.page.waitForSelector('.signin-local');assert.equal(new URL(f.page.url()).pathname,'/signin');assert.equal(await f.page.$('.app-header'),null);checks++;await f.close();
 }
 {
  const f=await fixture();await f.page.goto(origin+'/wallet');await f.page.waitForSelector('.app-header');f.state.logoutFails=true;
  await f.page.evaluate(()=>window.dispatchEvent(new Event('memoney:wallet-logout')));await f.page.waitForSelector('.wallet-connection-status');
  assert(await f.page.$eval('.wallet-connection-status',e=>e.textContent.includes('로그아웃')));assert.equal(await f.page.$('.app-header'),null);
  f.state.logoutFails=false;await f.page.click('.wallet-connection-status button');await f.page.waitForSelector('.signin-local');assert.equal(f.state.writes,2);checks++;await f.close();
 }
 console.log(JSON.stringify({checks,transientRecovery:true,unsavedFormPreserved:true,expiredSessionRequiresLogin:true,financialWrites:0}));
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
