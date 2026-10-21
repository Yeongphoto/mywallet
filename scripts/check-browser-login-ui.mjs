import { webUiArtifact } from './web-ui-artifact.mjs';
import puppeteer from 'puppeteer-core';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {handleAuth} from '../server/auth/http.ts';
const sqlite=new DatabaseSync(':memory:');for(const file of ['auth-foundation-schema.sql','ledger-invitations-schema.sql'])sqlite.exec(fs.readFileSync('scripts/'+file,'utf8'));
const user=crypto.randomUUID(),ledger=crypto.randomUUID();sqlite.prepare('INSERT INTO users VALUES(?,?,?)').run(user,'active',Date.now());sqlite.prepare('INSERT INTO auth_identities VALUES(?,?,?,?)').run('https://accounts.google.com','fixture-subject',user,Date.now());
const db={prepare(sql){return {sql,values:[],bind(...values){this.values=values;return this;},async first(){return sqlite.prepare(sql).get(...this.values)||null;},async run(){return sqlite.prepare(sql).run(...this.values);}};},async batch(items){sqlite.exec('BEGIN');try{const rows=items.map(s=>sqlite.prepare(s.sql).run(...s.values));sqlite.exec('COMMIT');return rows;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const root=path.resolve('dist'),types={'.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};let origin,starts=0,writes=0;
const env={DB:db,AUTH_ENABLED:'true',AUTH_GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',AUTH_LOCAL_DEV:'true',AUTH_BROWSER_LOGIN:'true'};
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin);
 if(url.pathname.startsWith('/api/')){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const request=new Request(url,{method:req.method,headers:req.headers,body:req.method==='POST'?Buffer.concat(chunks).toString():undefined});let response;
  if(url.pathname.startsWith('/api/auth/')){const action=url.pathname.split('/').at(-1);if(action==='browser-start')starts++;response=await handleAuth(request,env,action,async(token,client,nonce)=>{assert.equal(token,'fixture-credential');assert(sqlite.prepare('SELECT code FROM auth_browser_logins WHERE nonce=?').get(nonce));return {issuer:'https://accounts.google.com',subject:'fixture-subject',email:'fixture@gmail.com',authoritativeEmail:true};});}
  else if(url.pathname==='/api/wallet/context')response=Response.json({user:{id:user},ledger:{id:ledger,role:'owner',kind:'personal'},mode:'shared-web'});
  else if(url.pathname==='/api/data'){if(req.method!=='GET')writes++;response=Response.json({transactions:[],assets:[],plans:[],recurringRules:[],deletedRecurringTxs:[],cardSettlements:[],updatedAt:1});}
  else response=Response.json({});
  res.statusCode=response.status;response.headers.forEach((value,key)=>{if(key!=='set-cookie')res.setHeader(key,value);});const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 let file=path.join(root,url.pathname);if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(root,'index.html');res.setHeader('Content-Type',types[path.extname(file)]||'text/html');res.end(fs.readFileSync(file));
}catch(e){console.error(e);res.statusCode=500;res.end('{}');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;env.AUTH_ORIGIN=origin;
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage();await page.setViewport({width:1080,height:810,deviceScaleFactor:2});await page.goto(origin+'/signin');await page.waitForSelector('a.signin-google[href]');assert.equal(starts,1,'StrictMode creates only one flow');
 const url=await page.$eval('a.signin-google',el=>el.href);await page.$eval('a.signin-google',el=>el.addEventListener('click',e=>e.preventDefault()));await page.click('a.signin-google');await page.waitForSelector('.browser-login-code');
 const externalContext=await browser.createBrowserContext(),external=await externalContext.newPage();await external.setRequestInterception(true);
 external.on('request',req=>{if(req.url()==='https://accounts.google.com/gsi/client')return req.respond({status:200,contentType:'text/javascript',body:`window.google={accounts:{id:{initialize(o){window.fixtureGoogle=o},renderButton(el){const b=document.createElement('button');b.id='fixture-google';b.textContent='Google test account';b.onclick=()=>window.fixtureGoogle.callback({credential:'fixture-credential'});el.append(b)}}}}`});if(new URL(req.url()).origin!==origin)return req.abort();return req.continue();});
 await external.goto(url);await external.waitForSelector('.browser-code-confirm');assert.equal(new URL(external.url()).hash,'');await external.click('.browser-code-confirm input');await external.waitForSelector('#fixture-google');await external.click('#fixture-google');await external.waitForFunction(()=>document.querySelector('h1')?.textContent==='계정 확인 완료');
 await page.waitForSelector('.browser-account');assert.equal(await page.$eval('.browser-account',el=>el.textContent),'fixture@gmail.com');assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n,0);
 await page.click('.browser-login-controls button.signin-google');await page.waitForFunction(()=>location.pathname==='/wallet');await page.waitForSelector('.wallet-connection-screen',{hidden:true});assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n,1);
 const before=()=>page.$$eval('.sidebar nav > a,.mobile-primary-action',els=>els.map(el=>{const r=el.getBoundingClientRect();return[r.x,r.y,r.width,r.height];}));
 for(const width of [600,768,1080])for(const ui of ['default','theme1'])for(const theme of ['light','dark']){
  await page.setViewport({width,height:810,deviceScaleFactor:2});await page.evaluate(({ui,theme})=>{document.documentElement.dataset.uiTheme=ui;document.documentElement.dataset.theme=theme;},{ui,theme});const geometry=await before();
  for(const tab of ['summary','asset','plan','ledger']){
   const selector=`.sidebar a[href="#${tab}"]`,button=await page.$(selector),r=await button.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();
   await page.$eval(selector,async el=>{getComputedStyle(el,'::before').transform;for(let i=0;i<10;i++)await new Promise(requestAnimationFrame);});
   assert(await page.$eval(selector,el=>new DOMMatrixReadOnly(getComputedStyle(el,'::before').transform).m22<.95));assert.deepEqual(await before(),geometry);await page.mouse.up();
   await page.$eval(selector,async el=>{for(let i=0;i<22;i++)await new Promise(requestAnimationFrame);});assert(await page.$eval(selector,el=>Math.abs(new DOMMatrixReadOnly(getComputedStyle(el,'::before').transform).m22-1)<.001));
  }
 }
 await (await page.$('.sidebar')).screenshot({path:webUiArtifact('tablet-sidebar-jelly.png')});await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);assert.equal(await page.$eval('.sidebar a.active',el=>getComputedStyle(el,'::before').transitionDuration),'0s');
 assert.equal(writes,0);console.log('Separate browser cookie jars, actual nonce-bound handoff API, explicit email confirmation, one-time session, tablet/Fold jelly presses, themes and reduced motion passed. No financial writes.');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));sqlite.close();}
