import puppeteer from 'puppeteer-core';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createSession,resolveUser} from '../server/auth/store.ts';
import {handleAuth} from '../server/auth/http.ts';
import {handlePersonalOnboarding,ensurePersonalLedger,personalFinance} from '../server/wallet/personal.ts';
import {sharedWalletContext,sharedWalletData} from '../server/wallet/shared-web.ts';
import {handleLedgers} from '../server/wallet/shared-creation.ts';
import {handleSharing} from '../server/wallet/invitations.ts';
import {localSnapshot} from '../src/auth/local-wallet.ts';

function adapter(sqlite){return {prepare(sql){return {sql,values:[],bind(...values){this.values=values;return this;},async first(){return sqlite.prepare(sql).get(...this.values)||null;},async all(){return {results:sqlite.prepare(sql).all(...this.values)};},async run(){return {meta:{changes:sqlite.prepare(sql).run(...this.values).changes}};}};},async batch(items){sqlite.exec('BEGIN');try{const result=items.map(s=>{const q=sqlite.prepare(s.sql);return q.columns().length?{results:q.all(...s.values),meta:{changes:0}}:{meta:{changes:q.run(...s.values).changes}};});sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};}
const auth=new DatabaseSync(':memory:'),finance=new DatabaseSync(':memory:'),shared=new DatabaseSync(':memory:');
for(const file of ['auth-foundation-schema.sql','ledger-invitations-schema.sql','shared-creation-auth-schema.sql','personal-onboarding-auth-schema.sql'])auth.exec(fs.readFileSync('scripts/'+file,'utf8'));
shared.exec(fs.readFileSync('scripts/shared-creation-finance-schema.sql','utf8'));
const env={DB:adapter(auth),TEST_FINANCE:adapter(finance),TEST_SHARED_FINANCE:adapter(shared),AUTH_ENABLED:'true',AUTH_GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',AUTH_LOCAL_DEV:'true',AUTH_PERSONAL_ONBOARDING:'true',AUTH_SHARED_TEST_DEPLOYMENT:'true',AUTH_TEST_MULTI_LEDGER:'true',AUTH_TEST_PERSONAL_LEDGER:'true',AUTH_LEDGER_INVITES:'true',AUTH_LEDGER_RECOVERY:'true',AUTH_SHARED_WALLET_LEDGER_ID:crypto.randomUUID()};
let financialReads=0,financialWrites=0;const root=path.resolve('dist'),types={'.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,env.AUTH_ORIGIN);
 if(url.pathname.startsWith('/api/')){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'||req.method==='PATCH'?{body:Buffer.concat(chunks)}:{})});let response;
  if(url.pathname.startsWith('/api/auth/'))response=await handleAuth(request,env,url.pathname.split('/').at(-1));
  else if(url.pathname==='/api/wallet/onboarding')response=await handlePersonalOnboarding(request,env);
  else if(url.pathname==='/api/wallet/context')response=await sharedWalletContext(request,env);
  else if(url.pathname==='/api/wallet/ledgers')response=await handleLedgers(request,env);
  else if(url.pathname==='/api/wallet/sharing')response=await handleSharing(request,env);
  else if(url.pathname==='/api/data'){if(req.method==='GET')financialReads++;else financialWrites++;response=await sharedWalletData(request,env);}
  else response=Response.json({});
  res.statusCode=response.status;response.headers.forEach((v,k)=>{if(k!=='set-cookie')res.setHeader(k,v);});if(response.headers.getSetCookie().length)res.setHeader('Set-Cookie',response.headers.getSetCookie());res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 let file=path.join(root,url.pathname);if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(root,'index.html');res.setHeader('Content-Type',types[path.extname(file)]||'text/html');res.end(fs.readFileSync(file));
}catch(error){console.error(error);res.statusCode=500;res.end('{}');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));env.AUTH_ORIGIN=`http://127.0.0.1:${server.address().port}`;
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
 const page=await browser.newPage();await page.setViewport({width:411,height:900});
 await page.goto(env.AUTH_ORIGIN);await page.waitForFunction(()=>location.pathname==='/guest');await page.waitForSelector('.header-settings-btn');assert.equal(financialReads,0);assert.equal(financialWrites,0);
 const guest=crypto.randomUUID(),source=localSnapshot({getItem:()=>null},guest);
 source.transactions=[{id:'first-device',type:'income',date:'2026-10-21',amount:123,title:'첫 기기 기록',category:'salary'}];source.updatedAt=1;
 await page.evaluate(({guest,source})=>{localStorage.setItem('memoney:guest:active-id',guest);localStorage.setItem(`memoney:guest:${guest}:mywallet:v2`,JSON.stringify(source));},{guest,source});
 const user=await resolveUser(env.DB,{issuer:'https://accounts.google.com',subject:'ui-user'}),first=await createSession(env.DB,user,Date.now(),true);
 await page.setCookie({name:'mywallet-dev-session',value:first.token,domain:'127.0.0.1',path:'/',httpOnly:true,sameSite:'Lax'});
 await page.goto(env.AUTH_ORIGIN+'/signin?sync=local');await page.waitForFunction(()=>location.pathname==='/wallet');await page.waitForSelector('.wallet-connection-screen',{hidden:true});
 const read=async()=>personalFinance(env,await ensurePersonalLedger(env,user)).prepare('SELECT id FROM transactions').all();
 assert.deepEqual((await read()).results.map(r=>r.id),['first-device']);
 assert.equal(await page.evaluate(guest=>localStorage.getItem(`memoney:guest:${guest}:mywallet:v2`),guest),JSON.stringify(source));
 await page.goto(env.AUTH_ORIGIN+'/wallet#settings');await page.waitForSelector('.ledger-settings-controls');await page.waitForSelector('.wallet-connection-screen',{hidden:true});
 await page.click('.ledger-settings-controls .instant-select-trigger');await page.$$eval('.ledger-settings-controls [role=option]',buttons=>buttons.find(b=>b.textContent.includes('로컬 장부')).click());
 await page.waitForFunction(()=>location.pathname==='/guest');await page.waitForSelector('.ledger-connection-action');await page.click('.ledger-connection-action');await page.waitForFunction(()=>document.querySelector('.guest-sync-card .primary-button')?.textContent==='개인 장부 열기');
 const text=await page.$eval('.guest-sync-card',el=>el.textContent);assert(!text.includes('합치기'));assert(!text.includes('이어서 동기화'));assert(!text.includes('�'));await page.screenshot({path:'android/build/personal-onboarding-settings.png'});
 await page.click('.guest-sync-card .primary-button');await page.waitForFunction(()=>location.pathname==='/wallet');await page.waitForSelector('.wallet-connection-screen',{hidden:true});
 const otherContext=await browser.createBrowserContext(),other=await otherContext.newPage(),next=await createSession(env.DB,user,Date.now(),true),otherId=crypto.randomUUID();
 await other.setViewport({width:1080,height:810});await other.goto(env.AUTH_ORIGIN+'/guest');await other.waitForSelector('.header-settings-btn');
 await other.evaluate(({otherId,source})=>{localStorage.setItem('memoney:guest:active-id',otherId);localStorage.setItem(`memoney:guest:${otherId}:mywallet:v2`,JSON.stringify({...source,transactions:[{...source.transactions[0],id:'second-device'}]}));},{otherId,source});
 await other.setCookie({name:'mywallet-dev-session',value:next.token,domain:'127.0.0.1',path:'/',httpOnly:true,sameSite:'Lax'});
 await other.goto(env.AUTH_ORIGIN+'/signin?account=local');await other.waitForFunction(()=>location.pathname==='/wallet');await other.waitForSelector('.wallet-connection-screen',{hidden:true});
 assert.deepEqual((await read()).results.map(r=>r.id),['first-device']);assert.equal(financialWrites,0);
 assert.equal(await other.evaluate(id=>JSON.parse(localStorage.getItem(`memoney:guest:${id}:mywallet:v2`)).transactions[0].id,otherId),'second-device');
 console.log('Anonymous local-only root, first-login import, preserved source, settings without merge, reopening personal, second device login and no /api/data merge writes passed against isolated in-memory API handlers.');
 if(process.argv.includes('--serve')){
  console.log('Isolated UI inspection server: '+env.AUTH_ORIGIN+'/guest?sync=1#settings');
  await new Promise(resolve=>process.once('SIGINT',resolve));
 }
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));auth.close();finance.close();shared.close();}
