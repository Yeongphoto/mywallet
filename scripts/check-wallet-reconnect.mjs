import { webUiArtifact } from './web-ui-artifact.mjs';
import puppeteer from 'puppeteer-core';
import {createServer} from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Only local fixture responses are used. No account or financial server is contacted.
const root=path.resolve('dist');
const types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.gif':'image/gif','.json':'application/json','.webmanifest':'application/manifest+json'};
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
 const state={mode,dataFails:0,calls:0,active:0,peak:0,writes:0,expired:false,logoutFails:false,delay:0,successful:0,meowDelay:0};
 await page.setRequestInterception(true);
 page.on('request',async request=>{
  const url=new URL(request.url());if(url.origin!==origin){await request.abort();return;}
  if(!url.pathname.startsWith('/api/')){if(url.pathname==='/images/met-meow.gif'&&state.meowDelay)await sleep(state.meowDelay);await request.continue();return;}
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
   else data=state.payload||{transactions:[],assets:[],plans:[],recurringRules:[],deletedRecurringTxs:[],budget:500000,updatedAt:1234};
  }else if(url.pathname==='/api/auth/config')data={enabled:true,clientId:'fixture.apps.googleusercontent.com'};
  else if(url.pathname==='/api/auth/session'){status=state.expired?401:200;data=state.expired?{error:'UNAUTHENTICATED'}:{user:scope.user};}
  else if(url.pathname==='/api/auth/logout'){status=state.logoutFails?503:200;data={success:status===200};if(status===200)state.expired=true;}
  else if(url.pathname==='/api/wallet/ledgers')data={ledgers:[scope.ledger]};
  await request.respond({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 return {page,state,close:()=>context.close()};
}
try{
 {
  const f=await fixture();f.state.meowDelay=4500;
  await f.page.goto(origin+'/wallet');
  await f.page.waitForFunction(()=>document.querySelector('.wallet-connection-met img')?.naturalWidth===512);
  await f.page.evaluate(()=>{
   window.metFrames=[];
   function sample(){
    const screen=document.querySelector('.wallet-connection-screen');if(!screen)return;
    const visible=[...screen.querySelectorAll('img')].filter(img=>getComputedStyle(img).visibility==='visible'&&getComputedStyle(img).display!=='none');
    window.metFrames.push({state:screen.dataset.state,visible:visible.length,painted:visible.filter(img=>img.complete&&img.naturalWidth>0).length});
    requestAnimationFrame(sample);
   }sample();
  });
  await f.page.waitForSelector('.wallet-connection-screen',{hidden:true});
  const frames=await f.page.evaluate(()=>window.metFrames);
  const blank=frames.filter(frame=>frame.painted===0).length;
  const overlap=frames.filter(frame=>frame.visible>1).length;
  console.log(JSON.stringify({transitionFrames:frames.length,blankFrames:blank,overlapFrames:overlap}));
  assert(frames.some(frame=>frame.state==='sleep')&&frames.some(frame=>frame.state==='complete'));
  assert.equal(blank,0,'Keep sleep visible until meow has decoded');assert.equal(overlap,0,'Never display two characters in the same frame');
  assert.equal(f.state.writes,0);checks++;await f.close();
 }
 if(!process.argv.includes('--transition-only')){
 for(const quota of ['backup','snapshot']){
  const f=await fixture();
  f.state.payload={transactions:[],assets:[],plans:[],customExpenseCategories:[{id:'fixture-category',label:'Fixture'}],recurringRules:[],deletedRecurringTxs:[],budget:500000,updatedAt:1234};
  await f.page.evaluateOnNewDocument(({scope,quota})=>{
   const key=`memoney:user:${scope.user.id}:ledger:${scope.ledger.id}:mywallet:v2`;
   localStorage.setItem(key,JSON.stringify({transactions:[],assets:[],budget:123,updatedAt:1}));
   localStorage.setItem(key+':backup:existing','preserved-backup');
   window.quotaFailures=0;
   const original=Storage.prototype.setItem;
   Storage.prototype.setItem=function(k,v){
    if(k===(quota==='backup'?key+':pre-d1-backup':key)){window.quotaFailures++;throw new DOMException('Fixture storage full','QuotaExceededError');}
    return original.call(this,k,v);
   };
  },{scope,quota});
  await f.page.goto(origin+'/wallet');await f.page.waitForSelector('.wallet-connection-screen',{hidden:true});
  assert(await f.page.$('.app-header'));assert.equal(f.state.calls,1,'Storage quota must not cause a reconnect loop');
  const result=await f.page.evaluate(()=>({failures:window.quotaFailures,backups:Object.keys(localStorage).filter(k=>k.includes(':backup:')).map(k=>localStorage.getItem(k)),snapshot:JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.endsWith(':mywallet:v2'))))}));
  assert(result.failures>0);assert.deepEqual(result.backups,['preserved-backup'],'Keep existing backups without adding timestamp copies');
  if(quota==='backup')assert.equal(result.snapshot.budget,500000,'A backup quota failure must not prevent caching authoritative data');
  assert.equal(f.state.writes,0);checks++;await f.close();
 }
 for(const mode of ['network','server']){
  const f=await fixture(mode);await f.page.goto(origin+'/wallet');await f.page.waitForSelector('.wallet-connection-screen[data-state="sleep"]');await sleep(150);
  assert.equal(await f.page.$('.app-header'),null);assert.equal(await f.page.$('.wallet-connection-status'),null);
  assert.equal(await f.page.$eval('.wallet-connection-screen',e=>e.innerText),'');
  assert((await f.page.$eval('.wallet-connection-met img',e=>e.src)).endsWith('/met-sleep.gif'));
  if(process.argv.includes('--screenshots')&&mode==='network'){
   await f.page.waitForFunction(()=>document.querySelector('.wallet-connection-met img')?.naturalWidth===512);
   for(const [name,width,height] of [['phone',411,900],['fold',1080,810]]){
    await f.page.setViewport({width,height});
    for(const tone of ['light','dark']){
     await f.page.evaluate(value=>document.documentElement.setAttribute('data-theme',value),tone);
     await f.page.screenshot({path:webUiArtifact(`connection-sleep-${name}-${tone}.png`)});
    }
   }
   await f.page.setViewport({width:411,height:900});await f.page.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));
  }
  f.state.mode='ok';await f.page.evaluate(()=>window.dispatchEvent(new Event('online')));await f.page.waitForSelector('.wallet-connection-screen[data-state="complete"]');
  const completedAt=Date.now();
  assert.equal(await f.page.$eval('.app-header',e=>getComputedStyle(e).visibility),'hidden');
  assert((await f.page.$eval('.wallet-connection-met img:not([style*="hidden"])',e=>e.src)).endsWith('/met-meow.gif'));
  if(process.argv.includes('--screenshots')&&mode==='network')await f.page.screenshot({path:webUiArtifact('connection-meow-phone.png')});
  await f.page.waitForSelector('.wallet-connection-screen',{hidden:true});
  const duration=Date.now()-completedAt;assert(duration>=500&&duration<1300,`Completion display duration: ${duration}ms`);
  assert.equal(await f.page.$eval('.app-header',e=>getComputedStyle(e).visibility),'visible');
  assert(new URL(f.page.url()).pathname==='/wallet');assert.equal(f.state.writes,0);checks++;await f.close();
 }
 {
  const f=await fixture();f.state.dataFails=2;await f.page.goto(origin+'/wallet');await f.page.waitForSelector('.wallet-connection-screen[data-state="sleep"]');await sleep(150);assert.equal(await f.page.$('.app-header'),null);
  f.state.dataFails=0;await f.page.evaluate(()=>window.dispatchEvent(new Event('online')));await f.page.waitForSelector('.wallet-connection-screen',{hidden:true});assert.equal(f.state.writes,0);checks++;await f.close();
 }
 {
  const f=await fixture();await f.page.goto(origin+'/wallet');await f.page.waitForSelector('.app-header');await f.page.waitForSelector('.wallet-connection-screen',{hidden:true});
  await f.page.click('.mobile-primary-action');await f.page.waitForSelector('.entry-modal');await f.page.type('.content-entry-field input','아직 저장하지 않은 내용');
  await f.page.evaluate(()=>window.originalEntry=document.querySelector('.entry-modal'));
  f.state.mode='network';f.state.delay=150;f.state.peak=0;
  const before=f.state.calls;
  await f.page.evaluate(()=>{window.dispatchEvent(new Event('pageshow'));window.dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'));});
  await sleep(500);assert(f.state.calls>before);assert.equal(f.state.peak,1);
  assert(await f.page.evaluate(()=>document.querySelector('.entry-modal')===window.originalEntry));
  assert.equal(await f.page.$eval('.content-entry-field input',e=>e.value),'아직 저장하지 않은 내용');
  assert.equal(await f.page.$('.wallet-connection-screen'),null);
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
  const f=await fixture();await f.page.goto(origin+'/wallet');await f.page.waitForSelector('.app-header');await f.page.waitForSelector('.wallet-connection-screen',{hidden:true});f.state.logoutFails=true;
  await f.page.evaluate(()=>window.dispatchEvent(new Event('memoney:wallet-logout')));await f.page.waitForSelector('.wallet-connection-status');
  assert(await f.page.$eval('.wallet-connection-status',e=>e.textContent.includes('로그아웃')));assert.equal(await f.page.$('.app-header'),null);
  f.state.logoutFails=false;await f.page.click('.wallet-connection-status button');await f.page.waitForSelector('.signin-local');assert.equal(f.state.writes,2);checks++;await f.close();
 }
 }
 console.log(JSON.stringify({checks,transientRecovery:true,sleepThenMeow:true,completionDelayMs:700,unsavedFormPreserved:true,expiredSessionRequiresLogin:true,financialWrites:0}));
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
