import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {webUiArtifact} from './web-ui-artifact.mjs';

const origin=process.env.MEMONEY_UI_ORIGIN||'http://127.0.0.1:5190';
assert(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Local fixtures only');
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
let checks=0,financialRequests=0;
try{
 for(const [width,height] of [[411,900],[411,560],[768,700],[1080,900]])for(const styleTheme of ['default','theme1'])for(const theme of ['light','dark'])for(const type of ['expense','income','transfer']){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width,height});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.evaluateOnNewDocument(({theme,styleTheme,type})=>{
   const id='88888888-8888-4888-8888-888888888888',now=new Date(),date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
   localStorage.setItem('memoney:guest:active-id',id);localStorage.setItem('memoney:wallet-mode','local');
   localStorage.setItem('memoney:appearance:v1',JSON.stringify({theme,styleTheme}));
   localStorage.setItem(`memoney:guest:${id}:mywallet:v2`,JSON.stringify({theme,styleTheme,updatedAt:1,plans:[],recurringRules:[],deletedRecurringTxs:[],
    assets:[{id:'cash',category:'cash',name:'Fixture cash',memo:'',amount:0},{id:'bank',category:'bank',name:'Fixture bank',memo:'',amount:0}],
    transactions:[{id:'fixture',type,date,time:'12:30',amount:100,title:'수정 레이아웃 검증',category:type==='expense'?'food':type==='income'?'salary':'transfer',assetId:type==='transfer'?'cash':null,toAssetId:type==='transfer'?'bank':null,revision:1}]}));
  },{theme,styleTheme,type});
  await page.setRequestInterception(true);page.on('request',request=>{
   const url=new URL(request.url());if(url.pathname==='/api/data')financialRequests++;
   if(url.pathname.startsWith('/api/'))return void request.respond({status:401,contentType:'application/json',body:'{"error":"UNAUTHENTICATED"}'});
   if(url.origin!==origin)return void request.abort();void request.continue();
  });
  await page.goto(origin+'/guest#ledger');await page.waitForSelector('.header-settings-btn');
  await page.evaluate(()=>[...document.querySelectorAll('button[aria-label="거래 등록"]')].find(el=>el.getBoundingClientRect().width).click());
  await page.waitForSelector('.registration-mode-tabs');
  await page.$$eval('.registration-mode-tabs button',(buttons,type)=>buttons.find(el=>el.textContent===({expense:'지출',income:'수입',transfer:'이체'})[type]).click(),type);
  const metrics=()=>page.$eval('.entry-modal',modal=>{
   const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom};};
   const form=modal.querySelector('.entry-form'),grid=form.querySelector('.form-grid'),labels=[...grid.querySelectorAll(':scope > label:not(.recurring-toggle)')];
   const body=getComputedStyle(modal.querySelector('.modal-body'));
   return {modal:rect(modal),fields:labels.map(rect),font:getComputedStyle(labels[0].querySelector('button')).fontSize,
    order:labels.map(el=>el.classList.contains('amount-entry-field')?'amount':el.classList.contains('content-entry-field')?'title':el.getAttribute('aria-label')?.replace('계좌','자산')),
    gap:getComputedStyle(grid).rowGap,padding:[body.paddingTop,body.paddingRight,body.paddingBottom,body.paddingLeft],
    action:rect(form.querySelector('.entry-actions')),button:rect(form.querySelector('.entry-actions button'))};
  });
  const entry=await metrics();await page.click('[aria-label="등록 창 닫기"]');
  await page.evaluate(()=>{const link=[...document.querySelectorAll('nav a')].find(el=>el.textContent.trim()==='장부'&&el.getBoundingClientRect().width);link.click();});
  await page.waitForSelector('.mobile-ledger-swipe-edit');
  await page.$eval('.mobile-ledger-swipe-edit',button=>button.click());await page.waitForSelector('.transaction-edit-modal');
  const edit=await metrics(),label=`${width}x${height}/${styleTheme}/${theme}/${type}`;
  assert.equal(edit.fields.length,entry.fields.length,label+' field count');
  for(let i=0;i<entry.fields.length;i++)assert(Math.abs(edit.fields[i].h-entry.fields[i].h)<1,label+' field height '+i);
  assert(Math.abs(edit.modal.w-entry.modal.w)<1,label+' width');
  assert(Math.abs(edit.button.h-entry.button.h)<1,label+' action height');
  assert.equal(edit.font,entry.font,label+' font');assert.equal(edit.gap,entry.gap,label+' row gap');assert.deepEqual(edit.padding,entry.padding,label+' body padding');
  assert.deepEqual(edit.order,entry.order,label+' field order');
  if(width<=768&&styleTheme==='default'){
   assert(Math.abs(edit.modal.h-entry.modal.h)<1,label+' mobile full height');
   assert(Math.abs(edit.action.bottom-entry.action.bottom)<1,label+' actions anchored together '+JSON.stringify({entryBottom:entry.action.bottom,editBottom:edit.action.bottom,entryY:entry.modal.y,editY:edit.modal.y,entryH:entry.modal.h,editH:edit.modal.h}));
  }
  assert.deepEqual(errors,[],label+' runtime errors');
  if(width===411&&height===900&&theme==='dark'&&type==='expense')await page.screenshot({path:webUiArtifact(`entry-edit-${styleTheme}-${theme}.png`)});
  const closed=async()=>{
   await page.waitForSelector('.picker-popup-backdrop',{hidden:true});
   await new Promise(resolve=>setTimeout(resolve,80));
   assert.equal(await page.$('.picker-popup-backdrop'),null,label+' no chained picker');
   assert.equal(await page.evaluate(()=>document.activeElement?.tagName==='INPUT'),false,label+' no automatic focus');
  };
  const pickClick=async selector=>{
   await page.waitForSelector(selector,{visible:true});
   await page.$$eval('.picker-popup-sheet',elements=>Promise.all(elements.flatMap(el=>el.getAnimations()).map(a=>a.finished.catch(()=>{}))));
   await page.click(selector);
  };
  await page.$eval('.transaction-edit-modal .content-entry-field input',el=>el.focus());
  await page.keyboard.down('Control');await page.keyboard.press('a');await page.keyboard.up('Control');await page.keyboard.press('Backspace');await page.keyboard.press('Enter');await closed();
  if(type!=='transfer'){
   await page.click('.transaction-edit-modal label[aria-label="카테고리"]');
   await pickClick('.picker-grid-btn');await closed();
  }
  for(const name of type==='transfer'?['보내는 계좌','받는 계좌']:['계좌']){
   await page.click(`.transaction-edit-modal label[aria-label="${name}"]`);
   await pickClick('.picker-grid-btn');
   await closed();
  }
  await page.click('.transaction-edit-modal .amount-entry-field');await pickClick('.keypad-submit-btn');await closed();
  await page.$$eval('.transaction-edit-modal .date-time-entry-trigger',buttons=>buttons[0].click());await pickClick('.app-date-picker-today');await closed();
  await page.$$eval('.transaction-edit-modal .date-time-entry-trigger',buttons=>buttons[1].click());await pickClick('.app-time-picker-confirm');await closed();
  await page.click('.transaction-edit-modal .danger-button');await page.waitForSelector('.transaction-edit-modal',{hidden:true});
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('memoney:guest:88888888-8888-4888-8888-888888888888:mywallet:v2')).transactions[0].title),'수정 레이아웃 검증',label+' cancel preserves source');
  if(width===411&&height===900&&styleTheme==='default'&&theme==='light'&&type==='expense'){
   await page.$eval('.mobile-ledger-swipe-edit',button=>button.click());await page.waitForSelector('.transaction-edit-modal');
   await page.click('.transaction-edit-modal label[aria-label="계좌"]');await pickClick('.picker-grid-btn');await closed();
   await page.$eval('.transaction-edit-modal .content-entry-field input',el=>el.focus());
   await page.keyboard.down('Control');await page.keyboard.press('a');await page.keyboard.up('Control');await page.keyboard.type('Updated fixture');await page.keyboard.press('Enter');await closed();
   assert(await page.$('.transaction-edit-modal'),'Enter must not submit edits');
   await page.click('.transaction-edit-modal button[type="submit"]');await page.waitForSelector('.transaction-edit-modal',{hidden:true});
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('memoney:guest:88888888-8888-4888-8888-888888888888:mywallet:v2')).transactions[0].title),'Updated fixture','Explicit save persists the edit');
  }
  checks++;await page.close();
 }
 assert.equal(financialRequests,0);console.log(JSON.stringify({checks,matchedFields:true,matchedActions:true,matchedSpacing:true,financialRequests}));
}finally{await browser.close();}
