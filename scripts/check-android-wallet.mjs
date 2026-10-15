import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const targets = await fetch('http://127.0.0.1:9223/json/list',{signal:AbortSignal.timeout(5000)}).then(r=>r.json());
const target = targets.find(t => { const url=new URL(t.url); return url.origin==='http://localhost:5187' && url.pathname==='/wallet'; });
assert.ok(target?.webSocketDebuggerUrl,'Memoney must be on its authenticated wallet page');
const socket=new WebSocket(target.webSocketDebuggerUrl), pending=new Map(); let id=0;
socket.addEventListener('message',event=>{
  const data=JSON.parse(event.data), item=pending.get(data.id); if(!item)return;
  clearTimeout(item.timer);pending.delete(data.id);
  data.error?item.reject(Error('CDP failed')):item.resolve(data.result);
});
function command(method,params){return new Promise((resolve,reject)=>{
  const next=++id,timer=setTimeout(()=>{pending.delete(next);reject(Error('CDP timeout'));},30000);
  pending.set(next,{resolve,reject,timer});socket.send(JSON.stringify({id:next,method,params}));
});}
try {
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('CDP unavailable')),10000);
    socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
    socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP unavailable'));},{once:true});
  });
  const evaluated=await command('Runtime.evaluate',{expression:`(async()=>{
    const contextResponse=await fetch('/api/wallet/context',{cache:'no-store',signal:AbortSignal.timeout(10000)});
    const context=await contextResponse.json();
    const dataResponse=await fetch('/api/data',{cache:'no-store',signal:AbortSignal.timeout(20000)});
    const text=await dataResponse.text(),data=JSON.parse(text);
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
    const prefix='memoney:user:'+context.user?.id+':ledger:'+context.ledger?.id+':';
    const key=prefix+'mywallet:v2',cached=JSON.parse(localStorage.getItem(key)||'null');
    return JSON.stringify({path:location.pathname,contextStatus:contextResponse.status,dataStatus:dataResponse.status,
      appRendered:!!document.querySelector('.header-settings-btn'),overflow:document.documentElement.scrollWidth>innerWidth,
      digest:Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join(''),
      counts:Object.fromEntries(['transactions','assets','plans','recurringRules','cardSettlements'].map(key=>[key,data[key]?.length])),
      scopedCache:!!cached,cachedTransactions:cached?.transactions?.length,
      pending:Number(localStorage.getItem(prefix+'mywallet:v2:pendingSyncAt'))||0,
      legacyCachePresent:localStorage.getItem('mywallet:v2')!==null,
      brokenImages:[...document.images].filter(image=>!image.complete||image.naturalWidth===0).length
    });
  })()`,awaitPromise:true,returnByValue:true});
  assert.equal(evaluated.exceptionDetails,undefined);
  const state=JSON.parse(evaluated.result.value);
  assert.equal(state.contextStatus,200);assert.equal(state.dataStatus,200);assert.equal(state.appRendered,true);
  assert.equal(state.overflow,false);assert.equal(state.scopedCache,true);assert.equal(state.brokenImages,0);
  const remote=await fetch('https://mywallet-8mx.pages.dev/api/data',{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
  assert.equal(remote.status,200);
  assert.equal(state.digest,createHash('sha256').update(await remote.text()).digest('hex'),'Android and the existing web API must read the same current data');
  console.log(JSON.stringify({...state,digest:undefined,sameWebData:true}));
  if(process.argv.includes('--screenshot')){
    const screenshot=await command('Page.captureScreenshot',{format:'png'});
    writeFileSync('android/build/memoney-wallet-webview.png',Buffer.from(screenshot.data,'base64'));
  }
}finally{socket.close();}
