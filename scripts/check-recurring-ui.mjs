import puppeteer from 'puppeteer-core';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {onRequestGet,onRequestPatch} from '../functions/api/data.ts';
import {dateInTimeZone} from '../src/recurring.ts';
const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync('scripts/android-sandbox-schema.sql','utf8'));
const db={prepare(sql){return {sql,values:[],bind(...values){this.values=values;return this;},async first(){return sqlite.prepare(sql).get(...this.values)||null;},async all(){return {results:sqlite.prepare(sql).all(...this.values)};},async run(){return {meta:{changes:sqlite.prepare(sql).run(...this.values).changes}};}};},async batch(items){sqlite.exec('BEGIN');try{const result=items.map(s=>{const q=sqlite.prepare(s.sql);return q.columns().length?{results:q.all(...s.values),meta:{changes:0}}:{meta:{changes:q.run(...s.values).changes}};});sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const user={id:crypto.randomUUID()},ledger={id:crypto.randomUUID(),kind:'personal',role:'owner',name:'Fixture'};
const root=path.resolve('dist'),types={'.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};let origin;const operations=[];
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin);if(url.pathname.startsWith('/api/')){
  let response;
  if(url.pathname==='/api/data'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks).toString();if(body)operations.push(JSON.parse(body).op);
   const request=new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})});response=await(req.method==='GET'?onRequestGet:onRequestPatch)({request,env:{DB:db}});
  }else response=Response.json(url.pathname==='/api/wallet/context'?{user,ledger,mode:'shared-web'}:url.pathname==='/api/wallet/ledgers'?{ledgers:[ledger]}:url.pathname==='/api/auth/session'?{user}:{});
  res.statusCode=response.status;res.setHeader('Content-Type','application/json');res.end(await response.text());return;
 }
 let file=path.join(root,url.pathname);if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(root,'index.html');res.setHeader('Content-Type',types[path.extname(file)]||'text/html');res.end(fs.readFileSync(file));
}catch(error){console.error(error);res.statusCode=500;res.end('{}');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const today=dateInTimeZone('Asia/Seoul'),month=today.slice(0,7),day=Number(today.slice(8)),now=Date.now();
 const prior=new Date(month+'-01T12:00:00+09:00');prior.setMonth(prior.getMonth()+1);const nextMonth=dateInTimeZone('Asia/Seoul',prior).slice(0,7);
 const rule={id:'old-rule',type:'expense',day,amount:100,title:'Same title fixture',category:'phone',assetId:null,startMonth:month,endMonth:null,time:'09:13'};
 const write=async body=>{const response=await onRequestPatch({env:{DB:db},request:new Request(origin+'/api/data',{method:'PATCH',body:JSON.stringify(body)})});assert.equal(response.status,200,await response.clone().text());};
 await write({op:'recurring_rule.create',rule});await write({op:'recurring_rule.create',rule:{...rule,id:'next-rule',startMonth:nextMonth}});
 await write({op:'transaction.create',operationId:crypto.randomUUID(),transaction:{id:'original-payment',type:'expense',date:month+'-01',amount:100,title:rule.title,category:rule.category,recurringRuleId:'next-rule'}});
 const page=await browser.newPage();await page.emulateTimezone('Asia/Seoul');await page.setViewport({width:411,height:900});
 // A mounted app initially sees yesterday. Returning to it today must trigger creation.
 await page.evaluateOnNewDocument(now=>{const OriginalDate=Date;window.__fixtureNow=now-86400000;window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[window.__fixtureNow]));}static now(){return window.__fixtureNow;}};},now);
 await page.goto(origin+'/wallet#ledger');await page.waitForSelector('.wallet-connection-screen',{hidden:true});
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM transactions').get().n,1);assert(!operations.includes('recurring.generate'));
 await page.evaluate(now=>{window.__fixtureNow=now;document.dispatchEvent(new Event('visibilitychange'));},now);
 await page.waitForFunction(({key,id})=>JSON.parse(localStorage.getItem(key)||'{}').transactions?.some(t=>t.id===id),{},
  {key:`memoney:user:${user.id}:ledger:${ledger.id}:mywallet:v2`,id:`rec_old-rule_${month}`});
 const rows=sqlite.prepare('SELECT id,recurring_rule_id FROM transactions ORDER BY id').all();
 assert.equal(rows.length,2);assert.equal(rows.find(r=>r.id==='original-payment').recurring_rule_id,'next-rule');
 const cache=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),`memoney:user:${user.id}:ledger:${ledger.id}:mywallet:v2`);
 assert(cache.transactions.some(t=>t.id==='original-payment'&&t.recurringRuleId==='next-rule'));assert.equal(cache.transactions.find(t=>t.id===`rec_old-rule_${month}`).time,'09:13');
 const generated=operations.filter(op=>op==='recurring.generate').length;
 await page.reload();await page.waitForSelector('.wallet-connection-screen',{hidden:true});assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM transactions').get().n,2);
 assert.equal(operations.filter(op=>op==='recurring.generate').length,generated);assert(!operations.includes('transaction.update'));
 console.log('Actual App resume/date rollover, persisted generation, reload, unchanged source IDs/rule links and zero transaction rewrites passed with isolated SQLite.');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));sqlite.close();}
