import puppeteer from 'puppeteer-core';
import {createServer} from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const user={id:'11111111-1111-4111-8111-111111111111'};
const ledgers=[{id:'22222222-2222-4222-8222-222222222222',name:'Personal fixture',kind:'personal',role:'owner'},{id:'33333333-3333-4333-8333-333333333333',name:'Shared fixture',kind:'shared',role:'owner'}];
const root=path.resolve('dist'),types={'.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(root,'index.html');res.setHeader('Content-Type',types[path.extname(file)]||'text/html');res.end(fs.readFileSync(file));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
 const page=await browser.newPage();let dataLedger;await page.setRequestInterception(true);
 page.on('request',async req=>{const url=new URL(req.url());if(url.origin!==origin)return req.abort();if(!url.pathname.startsWith('/api/'))return req.continue();
  assert.equal(req.method(),'GET','Selection must never write financial data');
  let data={};if(url.pathname==='/api/wallet/context')data={user,ledger:ledgers.find(l=>l.id===req.headers()['x-memoney-ledger'])||ledgers[0],mode:'shared-web'};
  else if(url.pathname==='/api/wallet/ledgers')data={ledgers};
  else if(url.pathname==='/api/auth/session')data={user};
  else if(url.pathname==='/api/data'){dataLedger=req.headers()['x-memoney-ledger'];data={transactions:[],assets:[],plans:[],recurringRules:[],deletedRecurringTxs:[],cardSettlements:[],updatedAt:1};}
  await req.respond({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 for(const width of [360,411,768,1080]) {
  await page.setViewport({width,height:810,isMobile:width<600,hasTouch:width<600});
  await page.goto(origin+'/wallet#settings');await page.waitForSelector('.ledger-settings-controls',{visible:true});await page.waitForSelector('.wallet-connection-screen',{hidden:true});
  const trigger='.ledger-settings-controls .instant-select-trigger';
  for(const theme of ['default','theme1']) {
   await page.evaluate(theme=>document.documentElement.dataset.uiTheme=theme,theme);
   await page.click(trigger);await page.waitForSelector('.ledger-settings-controls [role=option]');
   const hits=await page.$$eval('.ledger-settings-controls [role=option]',els=>els.map(el=>{const r=el.getBoundingClientRect();return {label:el.textContent,hit:[.2,.5,.8].every(y=>el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height*y)))};}));
   console.log(width,theme,JSON.stringify(hits));assert(hits.every(h=>h.hit),'All option surfaces must receive clicks');
   await page.keyboard.press('Escape');
  }
  for(const name of ['Shared fixture','Personal fixture']) {
   await page.click(trigger);const option=await page.$(`.ledger-settings-controls [role=option]:nth-child(${name.startsWith('Shared')?2:1})`);await option.click();
   await page.waitForFunction(name=>document.querySelector('.ledger-settings-controls .instant-select-trigger')?.textContent.includes(name),{timeout:8000},name).catch(async error=>{await page.screenshot({path:'android/build/ledger-select-failure.png'});console.log(await page.evaluate(()=>({url:location.href,text:document.body.innerText.slice(-1800),selected:localStorage.getItem('memoney:selected-cloud-ledger:v1')})));throw error;});
   await page.waitForSelector('.wallet-connection-screen',{hidden:true});
   assert.equal(dataLedger,ledgers[name.startsWith('Shared')?1:0].id,'Data reads must use the newly selected ledger');
  }
 }
 console.log('Ledger selection pointer hit areas and bidirectional navigation passed. Mock APIs only.');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
