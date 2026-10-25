import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {webUiArtifact} from './web-ui-artifact.mjs';

const origin=process.env.MEMONEY_UI_ORIGIN||'http://127.0.0.1:5190';
assert(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Local fixtures only');
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const user='99999999-9999-4999-8999-999999999999',ledger='77777777-7777-4777-8777-777777777777';
let checks=0,writes=0;
try {
 for(const width of [320,768,1080])for(const theme of ['light','dark'])for(const styleTheme of ['default','theme1']) {
  const page=await browser.newPage();await page.setViewport({width,height:900});
  await page.evaluateOnNewDocument(({theme,styleTheme})=>{
   localStorage.setItem('memoney:appearance:v1',JSON.stringify({theme,styleTheme}));
   localStorage.setItem('memoney:usage-guide:v1:completed','1');
  },{theme,styleTheme});
  let releaseRecovery,mode='active';
  const held=new Promise(resolve=>{releaseRecovery=resolve;});
  await page.setRequestInterception(true);page.on('request',async request=>{
   const url=new URL(request.url());if(url.origin!==origin)return void request.abort();
   if(!url.pathname.startsWith('/api/'))return void request.continue();
   if(request.method()!=='GET')writes++;
   let status=200,body={};
   const selected={id:ledger,kind:'personal',name:'Fixture',role:mode==='guest'?'editor':'owner'};
   if(url.pathname==='/api/wallet/context')body={user:{id:user},ledger:selected,mode:'shared-web'};
   else if(url.pathname==='/api/auth/session')body={user:{id:user}};
   else if(url.pathname==='/api/wallet/ledgers')body={ledgers:[selected]};
   else if(url.pathname==='/api/data')body={transactions:[],assets:[],plans:[],recurringRules:[],deletedRecurringTxs:[],updatedAt:1};
   else if(url.pathname==='/api/account/membership')body={plan:'free',premium:false,expiresAt:null};
   else if(url.pathname==='/api/wallet/recovery') {
    await held;
    if(mode==='error'){status=503;body={error:'RECOVERY_UNAVAILABLE'};}
    else body={state:{status:mode==='archived'?'archived':'active',expires_at:Date.now()+604800000},generation:'initial',version:'fixture',counts:{},records:[],serverTime:Date.now()};
   }
   void request.respond({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(origin+'/wallet#settings');await page.waitForSelector('.settings-segment.jelly-toggle');
  const select=async title=>{
   await page.$$eval('.settings-segment > button',(buttons,title)=>buttons.find(el=>el.textContent===title).click(),title);
   await page.waitForFunction(()=>{
    const root=document.querySelector('.settings-segment'),thumb=root?.querySelector('.jelly-toggle-thumb')?.getBoundingClientRect(),button=root?.querySelector('button.active')?.getBoundingClientRect();
    return thumb&&button&&Math.abs(thumb.x-button.x)<.2&&Math.abs(thumb.y-button.y)<.2&&Math.abs(thumb.width-button.width)<.2;
   });
  };
  for(const title of ['카테고리','자산관리','정기기록','환경','데이터'])await select(title);
  const reset='.ledger-recovery .settings-card-actions button:last-child';
  await page.waitForSelector(reset,{visible:true});
  assert.equal(await page.$eval(reset,el=>el.textContent),'개인 장부 초기화');
  assert.equal(await page.$eval(reset,el=>el.disabled),true,'reset appears before delayed response, safely disabled');
  const before=await page.$eval(reset,el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
  await page.$eval(reset,el=>el.click());assert.equal(await page.$('.recovery-confirm'),null,'pending state cannot open confirmation');
  releaseRecovery();await page.waitForFunction(selector=>!document.querySelector(selector)?.disabled,{},reset);
  const after=await page.$eval(reset,el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
  assert.deepEqual(after,before,'API completion does not move or resize reset button');
  assert.equal(await page.$eval('.settings-segment > button.active',el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)','shared thumb supplies active surface');
  assert((await page.$eval('.settings-segment .jelly-toggle-thumb',el=>getComputedStyle(el).backgroundImage)).includes('gradient'),'shared jelly surface');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.click(reset);await page.waitForSelector('.recovery-confirm');
  assert.equal(await page.$eval('.recovery-confirm .primary-button',el=>el.disabled),true,'typed confirmation still required');
  await page.$$eval('.recovery-confirm button',buttons=>buttons.find(el=>el.textContent==='취소').click());
  if(width===320&&theme==='dark')await page.screenshot({path:webUiArtifact(`settings-controls-${styleTheme}.png`)});
  if(width===320&&theme==='light'&&styleTheme==='default') {
   for(const next of ['error','archived','guest']) {
    mode=next;await page.reload();await page.waitForSelector('.settings-segment');await select('데이터');
    if(next==='error'){
     await page.waitForSelector('.ledger-recovery [role="alert"]');
     assert.equal(await page.$eval(reset,el=>el.disabled),true,'failed lookup cannot enable reset');
    }else if(next==='archived'){
     await page.waitForFunction(()=>document.querySelector('.ledger-recovery')?.textContent.includes('복구 가능 기한'));
     assert.equal(await page.$$eval('.ledger-recovery button',buttons=>buttons.some(el=>el.textContent.includes('초기화'))),false,'archived ledger has no reset');
    }else assert.equal(await page.$$eval('.ledger-recovery button',buttons=>buttons.some(el=>el.textContent.includes('초기화'))),false,'guest has no reset permission');
   }
  }
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await select('환경');
  assert.equal(await page.$eval('.settings-segment .jelly-toggle-thumb',el=>getComputedStyle(el).transitionDuration),'0s');
  checks++;await page.close();
 }
 assert.equal(writes,0);console.log(JSON.stringify({checks,delayedRecovery:true,stableButton:true,jellyAligned:true,writes}));
} finally {await browser.close();}
