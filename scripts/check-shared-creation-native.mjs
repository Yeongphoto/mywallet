import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const targets=await fetch('http://127.0.0.1:9223/json/list').then(r=>r.json());
const target=targets.find(t=>t.url.startsWith('https://memoney-android-test.pages.dev/'));assert(target?.webSocketDebuggerUrl);
const socket=new WebSocket(target.webSocketDebuggerUrl),pending=new Map();let id=0;
socket.addEventListener('message',event=>{const data=JSON.parse(event.data),item=pending.get(data.id);if(!item)return;clearTimeout(item.timer);pending.delete(data.id);data.error?item.reject(Error(data.error.message)):item.resolve(data.result);});
const command=(method,params)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout'));},30000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.equal(r.exceptionDetails,undefined);return r.result.value;};
try {
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  const result=JSON.parse(await evaluate(`(async()=>{const r=await fetch('/api/wallet/ledgers',{cache:'no-store'}),data=await r.json();return JSON.stringify({status:r.status,personal:!!data.ledgers?.find(l=>l.kind==='personal'),creationEmpty:data.creation===null});})()`));
  assert.equal(result.status,200);assert(result.personal);assert(result.creationEmpty);
  await command('Page.navigate',{url:'https://memoney-android-test.pages.dev/sharing'});
  let shown=false;for(let n=0;n<80;n++){
    try{shown=await evaluate("!!document.querySelector('input[placeholder]') && document.body.textContent.includes('공유 장부 만들기')");}catch{}
    if(shown)break;await new Promise(r=>setTimeout(r,250));
  }
  assert(shown);const screen=JSON.parse(await evaluate("JSON.stringify({overflow:document.documentElement.scrollWidth>innerWidth,broken:document.body.textContent.includes(String.fromCharCode(65533)),copy:document.body.textContent.includes('개인 장부 복사하기'),empty:document.body.textContent.includes('빈 장부로 시작하기')})"));
  assert(!screen.overflow&&!screen.broken&&screen.copy&&screen.empty);
  const png=await command('Page.captureScreenshot',{format:'png'});writeFileSync('android/build/shared-creation-native.png',Buffer.from(png.data,'base64'));
  console.log(JSON.stringify({...result,...screen,financialWrites:0,userCreationSlotUnused:true}));
}finally{socket.close();}
