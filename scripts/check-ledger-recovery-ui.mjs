import puppeteer from 'puppeteer-core';
import {createServer} from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('dist'),types={'.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(root,'index.html');res.setHeader('Content-Type',types[path.extname(file)]||'text/html');res.end(fs.readFileSync(file));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const id='55555555-5555-4555-8555-555555555555',base=`memoney:guest:${id}:mywallet:v2`,pointer=`memoney:guest:${id}:recovery-generation`;
try {
 const page=await browser.newPage();await page.setViewport({width:360,height:900,deviceScaleFactor:2});let financialNetwork=0;
 async function mock(page){await page.setRequestInterception(true);page.on('request',async req=>{const u=new URL(req.url());if(u.origin!==origin)return req.abort();if(u.pathname==='/api/data')financialNetwork++;if(u.pathname.startsWith('/api/'))return req.respond({status:401,contentType:'application/json',body:'{"error":"UNAUTHENTICATED"}'});return req.continue();});}
 await mock(page);await page.goto(origin+'/guest#settings');await page.waitForSelector('.settings-tab-bar, .settings-stack');
 const seed={transactions:[{id:'t',title:'복구 시험',type:'income',date:'2026-10-21',time:'10:15',amount:100,category:'salary',assetId:'cash',revision:2}],assets:[{id:'cash',category:'bank',name:'현금',amount:0,memo:'테스트'}],plans:[{type:'expense',category:'food',plannedAmount:77}],recurringRules:[{id:'r',type:'expense',day:1,amount:10,title:'정기',category:'food',startMonth:'2099-01',time:'09:00'}],deletedRecurringTxs:['rec_r_2099-02'],cardSettlements:[],categoryLabels:{food:'식비'},categoryColors:{food:'#123456'},hiddenAssets:{cash:true},updatedAt:10};
 await page.evaluate(({id,base,seed})=>{localStorage.setItem('memoney:guest:active-id',id);localStorage.setItem(base,JSON.stringify(seed));location.reload();},{id,base,seed});
 const data=async()=>{await page.waitForSelector('.header-settings-btn');await page.$eval('.header-settings-btn',b=>b.click());await page.$$eval('button',buttons=>buttons.find(b=>b.textContent==='데이터').click());await page.waitForSelector('.ledger-recovery > button');};
 await data();await page.waitForFunction(()=>!document.querySelector('.ledger-recovery').textContent.includes('확인하고 있어요'));
 const read=()=>page.evaluate(({base,pointer})=>{const generation=localStorage.getItem(pointer);return JSON.parse(localStorage.getItem(generation?base+':generation:'+generation:base));},{base,pointer});
 const before=await read();
 const act=async(action)=>{await page.$$eval('.ledger-recovery button',(buttons,action)=>buttons.find(b=>b.textContent===(action==='초기화'?'로컬 장부 초기화':'복구')).click(),action);await page.type('.recovery-confirm input',action);await page.$eval('.recovery-confirm .primary-button',b=>b.click());};
 await act('초기화');await page.waitForFunction(pointer=>!!localStorage.getItem(pointer),{},pointer);await page.waitForSelector('.recovery-confirm',{hidden:true});
 assert.equal((await read()).transactions.length,0);assert.equal((await read()).assets.length,0);
 await page.evaluate(({base,pointer})=>{const key=base+':generation:'+localStorage.getItem(pointer),data=JSON.parse(localStorage.getItem(key));data.transactions=[{id:'new',title:'초기화 후 새 기록',type:'income',date:'2026-10-21',amount:7,category:'salary'}];localStorage.setItem(key,JSON.stringify(data));location.reload();},{base,pointer});
 await data();await act('복구');await page.waitForSelector('.recovery-confirm',{hidden:true});await page.waitForFunction(({base,pointer})=>JSON.parse(localStorage.getItem(base+':generation:'+localStorage.getItem(pointer))).transactions.some(t=>t.id==='t'),{},{base,pointer});
 const restored=await read();for(const key of ['transactions','assets','plans','recurringRules','deletedRecurringTxs','cardSettlements','categoryLabels','categoryColors','hiddenAssets'])assert.deepEqual(restored[key],before[key],key);
 const archives=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('memoney-recovery',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('archives').objectStore('archives').getAll();q.onsuccess=()=>{resolve(q.result);db.close();};q.onerror=()=>reject(q.error);};}));assert(archives.some(r=>r.kind==='before-restore'&&JSON.parse(r.snapshot).transactions.some(t=>t.id==='new')));
 await data();await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.includes(':mywallet:v2:generation:'))throw new DOMException('Full','QuotaExceededError');return original.call(this,key,value);};});
 await act('초기화');await page.waitForSelector('.ledger-recovery [role="alert"]');assert((await read()).transactions.some(t=>t.id==='t'));
 await (await page.$('.ledger-recovery')).screenshot({path:'android/build/recovery-local-360.png'});
 assert.equal(financialNetwork,0);console.log('Local IndexedDB reset/restore, all fields, before-restore preservation, generation isolation, quota failure and phone UI passed. No financial network requests.');
 const cloud=await browser.newPage();await cloud.setViewport({width:1080,height:810,deviceScaleFactor:2});
 const user='11111111-1111-4111-8111-111111111111',ledger='22222222-2222-4222-8222-222222222222';
 let generation='initial',status='active',role='owner',kind='personal',snapshot=structuredClone(seed),saved,archiveId,records=[],unsafe=0,recoveryGets=0;
 await cloud.setRequestInterception(true);cloud.on('request',async req=>{
  const url=new URL(req.url());if(url.origin!==origin)return req.abort();if(!url.pathname.startsWith('/api/'))return req.continue();let result={},code=200;
  if(url.pathname==='/api/wallet/context')result={user:{id:user},ledger:{id:ledger,name:'Fixture',role,kind,generation,recoveryStatus:status,recoveryExpiresAt:Date.now()+604800000},mode:'shared-web'};
  else if(url.pathname==='/api/data') {
   if(req.method()!=='GET'){unsafe++;return req.respond({status:409,contentType:'application/json',body:'{"error":"LEDGER_GENERATION_CHANGED"}'});}
   result=url.searchParams.has('after')?{changes:[],nextCursor:0}:snapshot;
  }else if(url.pathname==='/api/wallet/recovery') {
   if(req.method()==='GET'){recoveryGets++;result={state:{status,expires_at:Date.now()+604800000},generation,version:generation,counts:{transactions:snapshot.transactions.length},records,serverTime:Date.now()};}
   else {
    const body=JSON.parse(req.postData());assert.equal(body.generation,generation);assert.equal(body.version,generation);assert(body.operationId);
    if(body.action==='reset'){saved=snapshot;snapshot={...seed,transactions:[],assets:[],plans:[],recurringRules:[],deletedRecurringTxs:[],cardSettlements:[]};archiveId=body.operationId;records=[{id:archiveId,kind:'reset',created_at:Date.now(),expires_at:Date.now()+604800000,restored_at:null}];}
    else if(body.action==='restore'){assert.equal(body.recoveryId,archiveId);snapshot=saved;records[0].restored_at=Date.now();}
    generation=crypto.randomUUID();result={success:true,generation};
   }
  }else if(url.pathname==='/api/auth/session')result={user:{id:user}};
  await req.respond({status:code,contentType:'application/json',headers:url.pathname==='/api/data'?{'X-Memoney-Generation':generation}:{},body:JSON.stringify(result)});
 });
 const cloudData=async()=>{await cloud.waitForSelector('.header-settings-btn');await cloud.waitForSelector('.wallet-connection-screen',{hidden:true});await cloud.$eval('.header-settings-btn',b=>b.click());await cloud.$$eval('button',buttons=>buttons.find(b=>b.textContent==='데이터').click());await cloud.waitForSelector('.ledger-recovery > button');};
 await cloud.goto(origin+'/wallet');await cloud.waitForSelector('.wallet-connection-screen',{hidden:true});await cloudData();
 await cloud.$$eval('.ledger-recovery button',buttons=>buttons.find(b=>b.textContent==='개인 장부 초기화').click());
 assert(await cloud.$eval('.recovery-confirm .primary-button',b=>b.disabled));await cloud.type('.recovery-confirm input','초기화');await Promise.all([cloud.waitForNavigation({waitUntil:'domcontentloaded'}),cloud.click('.recovery-confirm .primary-button')]);
 await cloud.waitForSelector('.recovery-confirm',{hidden:true});assert.equal(snapshot.transactions.length,0);await cloudData();
 await cloud.$$eval('.ledger-recovery button',buttons=>buttons.find(b=>b.textContent==='복구').click());await cloud.type('.recovery-confirm input','복구');
 await Promise.all([cloud.waitForNavigation({waitUntil:'domcontentloaded'}),cloud.$eval('.recovery-confirm .primary-button',b=>b.click())]);assert.equal(snapshot.transactions[0]?.id,'t');
 await cloud.waitForSelector('.header-settings-btn');
 await cloud.evaluate(({user,ledger})=>{const prefix=`memoney:user:${user}:ledger:${ledger}:mywallet:v2`;localStorage.setItem(prefix+':pendingSyncAt','99');localStorage.setItem(prefix+':pendingTransactionOperations',JSON.stringify([{operationId:'old-op',status:'conflict',payload:{}}]));},{user,ledger});
 generation=crypto.randomUUID();await cloud.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await cloud.waitForSelector('.recovery-gate');
 await cloud.$eval('.recovery-gate .primary-button',b=>b.click());await cloud.waitForSelector('.recovery-gate',{hidden:true});await cloud.waitForSelector('.header-settings-btn');
 const preserved=await cloud.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('memoney-recovery',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('archives').objectStore('archives').getAll();q.onsuccess=()=>{resolve(q.result);db.close();};};}));assert(preserved.some(r=>r.values?.['mywallet:v2:pendingTransactionOperations']?.includes('old-op')));assert.equal(unsafe,0);
 await cloudData();await (await cloud.$('.ledger-recovery')).screenshot({path:'android/build/recovery-cloud-1080.png'});
 status='archived';kind='shared';await cloud.reload();await cloud.waitForSelector('.recovery-gate .ledger-recovery');assert.equal(await cloud.$('.summary-card'),null);
 const beforeGuest=recoveryGets;role='editor';await cloud.reload();await cloud.waitForSelector('.recovery-gate');assert((await cloud.$eval('.recovery-gate',el=>el.textContent)).includes('호스트'));assert.equal(recoveryGets,beforeGuest);
 console.log('Cloud reset/restore confirmation, generation headers, preserved stale pending queue, Fold UI, archived owner/guest gates passed with mocked APIs.');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
