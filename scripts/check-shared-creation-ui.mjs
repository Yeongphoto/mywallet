import { webUiArtifact } from './web-ui-artifact.mjs';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const origin=process.argv[2]||'https://memoney-android-test.pages.dev';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,defaultViewport:{width:411,height:914}});
try {
  const page=await browser.newPage(),user=crypto.randomUUID(),personal=crypto.randomUUID(),shared=crypto.randomUUID();
  let job=null,name='',creates=0,continues=0,fail=true,financeWrites=0;
  await page.setRequestInterception(true);
  page.on('request',async req=>{const path=new URL(req.url()).pathname;if(!path.startsWith('/api/'))return void req.continue();
    let status=200,data={};const body=req.postData()?JSON.parse(req.postData()):null;
    const books=()=>[{id:personal,name:'개인 장부',kind:'personal',role:'owner'},...(job?.status==='ready'?[{id:shared,name,kind:'shared',role:'owner'}]:[])];
    if(path==='/api/wallet/ledgers') {
      if(!body)data={ledgers:books(),creation:job};
      else if(body.action==='create'){creates++;name=body.name;assert.equal(body.source,'personal');job={id:shared,operationId:body.operationId,source:'personal',status:'copying',completed:0,total:100,percent:0};data={creation:job};}
      else if(body.action==='continue'){continues++;await new Promise(r=>setTimeout(r,250));
        if(fail&&job.completed===40){fail=false;status=503;data={error:'CREATION_UNAVAILABLE'};}
        else {const n=Math.min(100,job.completed+40);job={...job,completed:n,percent:n,status:n===100?'ready':'copying'};data={creation:job};}}
      else if(body.action==='rename'){name=body.name;data={success:true};}
    }else if(path==='/api/wallet/sharing')data={user:{id:user,email:'fixture@gmail.com'},personalLedger:{id:personal,name:'개인 장부'},ledger:job?.status==='ready'?{id:shared,name,role:'owner'}:null,members:[],invitations:[],receivedInvitations:[]};
    else if(path==='/api/data'&&req.method()!=='GET')financeWrites++;
    void req.respond({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(origin+'/sharing');await page.waitForSelector('[aria-label="새 공유 장부 이름"]');
  for(const width of [320,411,768]){await page.setViewport({width,height:914});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.setViewport({width:411,height:914});await page.screenshot({path:webUiArtifact('shared-creation-form.png')});
  await page.type('[aria-label="새 공유 장부 이름"]','우리 가계부');
  await page.$eval('.sharing-card form',form=>form.requestSubmit());
  await page.waitForFunction(()=>document.querySelector('.sharing-copy strong')?.textContent==='40%');
  await page.waitForFunction(()=>document.querySelector('.sharing-copy button')?.textContent==='이어서 진행');
  await page.screenshot({path:webUiArtifact('shared-copy-progress.png')});
  assert.equal(creates,1);assert.equal(await page.$eval('progress',e=>e.value),40);
  await page.reload();await page.waitForFunction(()=>document.querySelector('.sharing-copy strong')?.textContent==='40%');
  await page.click('.sharing-copy button');await page.waitForFunction(()=>!document.querySelector('.sharing-copy')&&document.querySelector('[aria-label="공유 장부 이름 변경"]'));
  assert.equal(creates,1);assert.equal(job.percent,100);assert.equal(await page.$$eval('.sharing-book',elements=>elements.length),0);
  assert.equal(await page.$eval('.sharing-ledger-heading > span',e=>e.textContent),'호스트');
  assert.equal(await page.$('[aria-label="새 공유 장부 이름"]'),null);
  for(const width of [320,411,768]){await page.setViewport({width,height:914});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  assert.equal(financeWrites,0);console.log(JSON.stringify({progress:true,resumeAfterReload:true,ownerLimitUI:true,viewportChecks:3,creates,continues,financeWrites}));
}finally{await browser.close();}
