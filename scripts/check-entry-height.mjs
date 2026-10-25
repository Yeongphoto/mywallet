import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {webUiArtifact} from './web-ui-artifact.mjs';
import {checkPageActionCenters} from './check-page-action-centers.mjs';

const origin=process.env.MEMONEY_UI_ORIGIN||'http://127.0.0.1:5190';
assert(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Local fixtures only');
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
let checks=0,financialRequests=0;
try {
 for(const [width,height] of [[320,568],[411,560],[768,560],[411,900]])for(const styleTheme of ['default','theme1'])for(const theme of ['light','dark']) {
  const page=await browser.newPage();await page.setViewport({width,height});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.evaluateOnNewDocument(({theme,styleTheme})=>{
   localStorage.setItem('memoney:wallet-mode','local');
   localStorage.setItem('memoney:usage-guide:v1:completed','true');
   localStorage.setItem('memoney:appearance:v1',JSON.stringify({theme,styleTheme}));
  },{theme,styleTheme});
  await page.setRequestInterception(true);page.on('request',request=>{
   const url=new URL(request.url());if(url.pathname==='/api/data')financialRequests++;
   if(url.pathname.startsWith('/api/'))return void request.respond({status:401,contentType:'application/json',body:'{"error":"UNAUTHENTICATED"}'});
   if(url.origin!==origin)return void request.abort();void request.continue();
  });
  await page.goto(origin+'/guest#ledger');await page.waitForSelector('.header-settings-btn');
  await page.evaluate(()=>[...document.querySelectorAll('button[aria-label="거래 등록"]')].find(el=>el.getBoundingClientRect().width).click());
  await page.waitForSelector('.registration-mode-tabs');
  await page.evaluate(()=>document.documentElement.style.setProperty('--safe-area-inset-top','24px'));
  for(const title of ['지출','수입','자산','이체']) {
   await page.$$eval('.registration-mode-tabs button',(buttons,title)=>buttons.find(el=>el.textContent===title).click(),title);
   const layout=await page.$eval('.entry-modal',modal=>{
    const scroller=modal.closest('.entry-dialog-viewport'),header=document.querySelector('.app-page-header');
    const actions=modal.querySelector('.entry-actions');
    const field=modal.querySelector('.form-grid > label:not(.recurring-toggle)');
    return {overflow:scroller.scrollHeight-scroller.clientHeight,top:scroller.getBoundingClientRect().top,
     headerBottom:header.getBoundingClientRect().bottom,actionBottom:actions?.getBoundingClientRect().bottom,
     gap:parseFloat(getComputedStyle(modal.querySelector('.form-grid')).rowGap),fieldHeight:field.getBoundingClientRect().height};
   });
   const label=`${width}x${height}/${styleTheme}/${theme}/${title}`;
   await checkPageActionCenters(page);
   assert(layout.top>=layout.headerBottom-1,label+' header clear');
   assert(layout.overflow<=1,label+' unnecessary scroll '+JSON.stringify(layout));
   assert(layout.actionBottom<=height+1,label+' actions fit');
   assert(layout.fieldHeight>=44,label+' touch target');
   if(styleTheme==='default')assert(height<600?layout.gap<=7:layout.gap===12,label+' responsive spacing '+JSON.stringify(layout));
   checks++;
  }
  if(width===411&&theme==='dark'&&styleTheme==='default')await page.screenshot({path:webUiArtifact(`entry-height-${height}.png`)});
  await page.close();
 }
 assert.equal(financialRequests,0);console.log(JSON.stringify({checks,financialRequests,noUnnecessaryScroll:true}));
} finally {await browser.close();}
