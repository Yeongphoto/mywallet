import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const config=JSON.parse(readFileSync('.android-tools/personal-test-wallet.json','utf8'));
const targets=await fetch('http://127.0.0.1:9223/json/list').then(r=>r.json());
const target=targets.find(t=>t.url.startsWith('https://memoney-android-test.pages.dev/'));
assert(target?.webSocketDebuggerUrl);
const socket=new WebSocket(target.webSocketDebuggerUrl), pending=new Map();let id=0;
socket.addEventListener('message',event=>{const data=JSON.parse(event.data),item=pending.get(data.id);if(!item)return;clearTimeout(item.timer);pending.delete(data.id);data.error?item.reject(Error('CDP failed: '+data.error.message)):item.resolve(data.result);});
function command(method,params){return new Promise((resolve,reject)=>{const next=++id,timer=setTimeout(()=>{pending.delete(next);reject(Error('CDP timeout'));},30000);pending.set(next,{resolve,reject,timer});socket.send(JSON.stringify({id:next,method,params}));});}
const evaluate=async expression=>{const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.equal(result.exceptionDetails,undefined);return result.result.value;};
try {
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  const context=JSON.parse(await evaluate("fetch('/api/wallet/context',{cache:'no-store'}).then(async r=>JSON.stringify({status:r.status,data:await r.json()}))"));
  assert.equal(context.status,200);assert.equal(context.data.ledger.kind,'personal');assert.equal(context.data.ledger.id,config.ledgerId);
  const live=JSON.parse(await evaluate(`(async()=>{
    const read=async()=>{const r=await fetch('/api/data',{cache:'no-store'});if(!r.ok)throw Error('Read failed');return r.json();};
    const write=async body=>{const r=await fetch('/api/data',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
    const before=await read(),tx={id:crypto.randomUUID(),type:'expense',date:'2026-10-14',amount:100,title:'Isolated verification',category:'food'};
    const create={op:'transaction.create',operationId:crypto.randomUUID(),transaction:tx};
    const created=await write(create),retry=await write(create);
    if(created.status!==200||retry.status!==200)throw Error('Creation failed');
    const updated=await write({op:'transaction.update',operationId:crypto.randomUUID(),expectedRevision:1,transaction:{...tx,amount:200}});
    const conflict=await write({op:'transaction.update',operationId:crypto.randomUUID(),expectedRevision:1,transaction:{...tx,amount:300}});
    const after=await read(),saved=after.transactions.find(t=>t.id===tx.id);
    const deleted=await write({op:'transaction.delete',operationId:crypto.randomUUID(),expectedRevision:2,transactionId:tx.id});
    const final=await read();
    return JSON.stringify({create:created.status,retry:retry.status,update:updated.status,conflict:conflict.status,delete:deleted.status,
      savedAmount:saved?.amount,initialTransactions:before.transactions.length,finalTransactions:final.transactions.length,
      temporaryRecordAbsent:!final.transactions.some(t=>t.id===tx.id),id:tx.id});
  })()`));
  assert.equal(live.create,200);assert.equal(live.retry,200);assert.equal(live.update,200);assert.equal(live.conflict,409);assert.equal(live.delete,200);
  assert.equal(live.savedAmount,200);assert.equal(live.initialTransactions,live.finalTransactions);assert(live.temporaryRecordAbsent);
  const web=await fetch('https://mywallet-8mx.pages.dev/api/data',{cache:'no-store',redirect:'error'});assert.equal(web.status,200);
  assert(!(await web.json()).transactions.some(t=>t.id===live.id));
  await command('Page.navigate',{url:'https://memoney-android-test.pages.dev/wallet#settings'});
  let label;for(let n=0;n<60;n++) {
    label=await evaluate("document.querySelector('.ledger-settings-row')?.textContent || ''");
    if(label.includes('개인 장부'))break;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert(label.includes('개인 장부'));
  const screenshot=await command('Page.captureScreenshot',{format:'png'});writeFileSync('android/build/personal-test-native.png',Buffer.from(screenshot.data,'base64'));
  const result={...live,id:undefined,personalLedger:true,webTestRecordAbsent:true,settingsLabelCorrect:true};
  writeFileSync('android/build/personal-test-native-check.json',JSON.stringify(result,null,2)+'\n','utf8');console.log(JSON.stringify(result));
}finally{socket.close();}
