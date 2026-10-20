import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import puppeteer from 'puppeteer-core';

const root=path.resolve('dist');
const types={'.js':'text/javascript','.css':'text/css','.gif':'image/gif','.png':'image/png','.svg':'image/svg+xml'};
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,timeout:5000});
const server=createServer((req,res)=>{
 let file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(root,'index.html');
 res.setHeader('Content-Type',types[path.extname(file)]||'text/html');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let checks=0;
try{
 for(const native of [false,true])for(const initial of [true,false]){
  const context=await browser.createBrowserContext();const page=await context.newPage();
  page.setDefaultTimeout(8000);await page.setViewport({width:411,height:900,deviceScaleFactor:2});
  if(native)await page.setUserAgent((await browser.userAgent())+' MemoneyAndroid');
  await page.setRequestInterception(true);
  page.on('request',request=>{
   const url=new URL(request.url());
   if(url.origin!==origin)return request.abort();
   if(url.pathname.startsWith('/api/'))return; // Hold the authentication request; no live data.
   if(initial&&url.pathname.startsWith('/assets/')&&url.pathname.endsWith('.js'))return request.respond({status:200,contentType:'text/javascript',body:''});
   return request.continue();
  });
  await page.goto(origin+'/signin',{waitUntil:'domcontentloaded'});
  if(native){
   const selector=initial?'.app-loading-met img':'.wallet-connection-met img';
   await page.waitForSelector(selector,{visible:true});
   await page.waitForFunction(selector=>document.querySelector(selector)?.naturalWidth===512,{},selector);
   const result=await page.$eval(selector,img=>({src:img.src,width:img.parentElement.getBoundingClientRect().width,top:img.parentElement.getBoundingClientRect().top,visible:getComputedStyle(img).visibility}));
   assert(result.src.endsWith('/met-sleep.gif'));assert.equal(result.width,184);
   assert.equal(result.visible,'visible');assert(Math.abs(result.top-(900-184)/2)<1);
   if(initial)assert.equal(await page.$eval('.app-loading-mark',e=>getComputedStyle(e).display),'none');
   else assert.equal(await page.$('.app-loading-screen'),null);
  }else{
   await page.waitForSelector('canvas.app-loading-glyph[data-painted="true"]');
   assert.equal(await page.$eval('.app-loading-logo',e=>e.getBoundingClientRect().width),49);
   if(initial)assert.equal(await page.$eval('.app-loading-met',e=>getComputedStyle(e).display),'none');
  }
  fs.mkdirSync('android/build',{recursive:true});
  await page.screenshot({path:`android/build/launch-${native?'native':'web'}-${initial?'initial':'react'}.png`});
  checks++;await context.close();
 }
 console.log(JSON.stringify({checks,nativeSleep:true,initialAndReactMatch:true,webCanvasPreserved:true,financialWrites:0}));
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
