// Staged, explicitly selected probe-only backup/recovery check. The caller
// handles Android document dialogs between stages; no user app or D1 access.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import puppeteer from 'puppeteer-core';
import { parseDevices, selectPhysicalDevice, inspectDeviceReadiness } from './android-device-preflight.mjs';
import { webUiArtifact } from './web-ui-artifact.mjs';
assert.equal(process.argv.length, 6); assert.equal(process.argv[2], '--serial'); assert.equal(process.argv[4], '--phase');
const serial = process.argv[3], phase = process.argv[5], app = 'com.memoney.probe';
assert(['export','verify-file','reset','verify-reset','recover','prepare-import','import','verify-import'].includes(phase));
const adb = join(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(process.env.LOCALAPPDATA, 'Android/Sdk'), 'platform-tools/adb.exe');
selectPhysicalDevice(parseDevices(execFileSync(adb,['devices','-l'],{encoding:'utf8'})),serial);
assert.equal(inspectDeviceReadiness().apk.appId, app);
const run = (...args) => execFileSync(adb,['-s',serial,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const statePath = 'android/build/physical-recovery-session.json';
let state = phase === 'export' ? null : JSON.parse(readFileSync(statePath,'utf8'));
if (state) { assert.equal(state.appId, app); assert(/^memoney-probe-roundtrip-[a-f0-9]{8}\.json$/.test(state.filename)); }
let browser, page, port;
async function attach() {
  for(let attempt=0;attempt<40;attempt++) {
    try {
      const pid=run('shell','pidof',app).split(/\s/)[0]; assert(/^\d+$/.test(pid));
      if(!port)port=run('forward','tcp:0','localabstract:webview_devtools_remote_'+pid);
      browser=await puppeteer.connect({browserURL:'http://127.0.0.1:'+port,defaultViewport:null});
      page=(await browser.pages()).find(p=>p.url().startsWith('https://localhost/guest'));
      assert(page,'Never operate cloud or other app pages'); await page.waitForSelector('.app-header');
      assert.notEqual(await page.evaluate(()=>localStorage.getItem('memoney:wallet-mode')),'shared-web'); return;
    }catch(error){if(attempt===39)throw error;await browser?.disconnect();await new Promise(r=>setTimeout(r,250));}
  }
}
async function snapshot() {
  return page.evaluate(()=>{
    const id=localStorage.getItem('memoney:guest:active-id'), generation=localStorage.getItem(`memoney:guest:${id}:recovery-generation`)||'initial';
    const key=`memoney:guest:${id}:mywallet:v2`+(generation==='initial'?'':':generation:'+generation);
    return {id,generation,data:JSON.parse(localStorage.getItem(key))};
  });
}
async function settings() {
  await page.goto('https://localhost/guest#settings'); await page.waitForSelector('.app-header');
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='데이터').click());
  await page.waitForSelector('.ledger-recovery button');
}
function sameData(actual, expected) {
  const normalize=data=>Object.fromEntries(Object.entries(data).filter(([key])=>key!=='updatedAt'));
  assert.deepEqual(normalize(actual),normalize(expected));
}
async function archives() {
  return page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('memoney-recovery',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    try{return await new Promise((resolve,reject)=>{const r=db.transaction('archives').objectStore('archives').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}
  });
}
async function restart() {
  run('shell','am','force-stop',app); await browser.disconnect();
  if(port){run('forward','--remove','tcp:'+port);port=null;}
  run('shell','am','start','-n',app+'/com.mywallet.dev.MainActivity'); await attach();
}
try {
  await attach();
  if(state)assert.equal((await snapshot()).id,state.before.id,'Guest identity changed; do not operate another ledger');
  if(phase==='export') {
    const before=await snapshot(); assert(before.data.transactions.length||before.data.assets.length,'Require synthetic probe records');
    assert(before.data.assets.length&&before.data.assets.every(a=>a.name.startsWith('Probe 현금 ')),'Require only the known synthetic assets');
    assert(before.data.transactions.every(t=>t.title.startsWith('실기기 합성 검증 ')||t.category==='opening-balance'),'Unknown financial record; do not reset');
    assert(before.data.plans.every(p=>p.plannedAmount===0),'Do not reset non-synthetic financial plans');
    const artifact=webUiArtifact('physical-recovery-original.json'); writeFileSync(artifact,JSON.stringify(before),'utf8');
    state={appId:app,filename:'memoney-probe-roundtrip-'+randomUUID().slice(0,8)+'.json',before,artifact};
    writeFileSync(statePath,JSON.stringify(state,null,2),'utf8');
    await settings();
    await page.evaluate(()=>[...document.querySelectorAll('.settings-data-card')].find(c=>c.querySelector('strong')?.textContent==='로컬 백업').querySelector('button').click());
    console.log(JSON.stringify({phase,next:'Save in Downloads using the unique filename; do not overwrite another file',filename:state.filename,originalPreserved:artifact}));
  } else if(phase==='verify-file') {
    const text=run('exec-out','cat','/sdcard/Download/'+state.filename), backup=JSON.parse(text);
    assert.equal(backup.format,'memoney-local'); assert.equal(backup.version,1); sameData(backup.data,state.before.data);
    state.fileVerified=true; state.backup=backup;
    writeFileSync(webUiArtifact(state.filename),text,'utf8'); writeFileSync(statePath,JSON.stringify(state,null,2),'utf8');
    console.log(JSON.stringify({phase,actualAndroidSavedFileMatchesOriginal:true}));
  } else if(phase==='reset'||phase==='verify-reset') {
    assert(state.fileVerified,'Never reset before verifying the external file');
    if(phase==='reset') {
    sameData((await snapshot()).data,state.before.data);
    await settings();
    await page.evaluate(()=>[...document.querySelectorAll('.ledger-recovery button')].find(b=>b.textContent==='로컬 장부 초기화').click());
    await page.type('.recovery-confirm input','초기화');
    await page.evaluate(()=>[...document.querySelectorAll('.recovery-confirm button')].find(b=>b.textContent==='확인').click());
    await page.waitForFunction(old=>localStorage.getItem(`memoney:guest:${localStorage.getItem('memoney:guest:active-id')}:recovery-generation`)!==old,{},state.before.generation==='initial'?null:state.before.generation);
    // Wait for the real completion reload, not only the optimistic pointer.
    await page.waitForFunction(()=>!document.querySelector('.recovery-confirm'));
    }
    await restart(); const reset=await snapshot();
    assert.equal(reset.id,state.before.id); assert.notEqual(reset.generation,state.before.generation);
    for(const key of ['transactions','assets','recurringRules','deletedRecurringTxs']) assert.equal(reset.data[key].length,0,key);
    // App initializes zero-valued category plan templates after an empty reset.
    assert(reset.data.plans.every(plan=>plan.plannedAmount===0),'Only zero-valued default plans are allowed');
    const record=(await archives()).find(r=>r.localLedger===reset.id&&r.generation===state.before.generation&&r.resultGeneration===reset.generation&&r.committed);
    assert(record); sameData(JSON.parse(record.snapshot),state.before.data); assert.equal(record.expires_at-record.created_at,7*24*60*60*1000);
    state.reset={generation:reset.generation,recoveryId:record.id}; writeFileSync(statePath,JSON.stringify(state,null,2),'utf8');
    console.log(JSON.stringify({phase,resetSurvivesRestart:true,sevenDayArchiveComplete:true}));
  } else if(phase==='recover') {
    assert(state.reset&&state.fileVerified); await settings();
    const eligible=(await archives()).filter(r=>r.localLedger===state.before.id&&r.committed&&!r.restored_at).sort((a,b)=>b.created_at-a.created_at);
    const index=eligible.findIndex(r=>r.id===state.reset.recoveryId); assert(index>=0);
    await page.evaluate(index=>document.querySelectorAll('.recovery-record button')[index].click(),index);
    await page.type('.recovery-confirm input','복구');
    await page.evaluate(()=>[...document.querySelectorAll('.recovery-confirm button')].find(b=>b.textContent==='확인').click());
    await page.waitForFunction(()=>!document.querySelector('.recovery-confirm'));
    await restart(); const recovered=await snapshot(); sameData(recovered.data,state.before.data);
    assert.equal(recovered.id,state.before.id); assert.notEqual(recovered.generation,state.reset.generation);
    state.recovered=true; writeFileSync(statePath,JSON.stringify(state,null,2),'utf8');
    console.log(JSON.stringify({phase,sevenDayRecoveryMatchesOriginalAfterRestart:true}));
  } else if(phase==='prepare-import') {
    assert(state.recovered&&state.fileVerified);
    // Cancel the first selection; introduce a real visible difference so the
    // round-trip cannot pass merely because current data equals the backup.
    await page.waitForSelector('.confirm-actions .secondary-button'); await page.click('.confirm-actions .secondary-button');
    const row=state.before.data.transactions.find(r=>r.type==='expense'&&r.title.startsWith('실기기 합성 검증 '));assert(row,'Require a known synthetic record');
    await page.click('.sidebar a[href="#ledger"]');
    await page.waitForFunction(title=>[...document.querySelectorAll('.mobile-ledger-swipe')].some(r=>r.textContent.includes(title)),{},row.title);
    await page.evaluate(title=>[...document.querySelectorAll('.mobile-ledger-swipe')].find(r=>r.textContent.includes(title)).querySelector('button[aria-label="수정"]').click(),row.title);
    const input='.transaction-edit-modal .content-entry-field input';await page.waitForSelector(input);
    await page.evaluate(selector=>{const i=document.querySelector(selector);i.focus();i.setSelectionRange(0,i.value.length);},input);
    await page.keyboard.press('Backspace');await page.type(input,'백업 복원 전 합성 변경');
    await page.evaluate(()=>{document.activeElement?.blur();document.querySelector('.entry-form').requestSubmit();});
    await page.waitForFunction(()=>!document.querySelector('.entry-form'));
    state.beforeImport=await snapshot();state.modifiedId=row.id;writeFileSync(statePath,JSON.stringify(state,null,2),'utf8');
    console.log(JSON.stringify({phase,syntheticDifferenceSaved:true}));
  } else if(phase==='import') {
    assert(state.recovered&&state.fileVerified); await settings();
    await page.evaluate(()=>[...document.querySelectorAll('.settings-data-card')].find(c=>c.querySelector('strong')?.textContent==='로컬 백업').querySelector('label').click());
    console.log(JSON.stringify({phase,next:'Select only the verified synthetic JSON file in the Android picker',filename:state.filename}));
  } else {
    assert(state.recovered&&state.fileVerified);
    await page.waitForSelector('.confirm-actions .primary-button');
    assert.equal(await page.$eval('#confirm-title',e=>e.textContent),'로컬 백업 복원');
    await page.click('.confirm-actions .primary-button');
    await page.waitForFunction(()=>!document.querySelector('.confirm-actions'));
    await page.waitForFunction(async({id,modifiedId,originalTitle})=>{
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('memoney-guest-durability-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      try{return await new Promise(resolve=>{const r=db.transaction('states').objectStore('states').get(id);r.onsuccess=()=>{
        const s=r.result,key=`memoney:guest:${id}:mywallet:v2`+(s.generation==='initial'?'':':generation:'+s.generation);
        resolve(JSON.parse(s.values[key]).transactions.find(t=>t.id===modifiedId)?.title===originalTitle);
      };});}finally{db.close();}
    },{}, {id:state.before.id,modifiedId:state.modifiedId,originalTitle:state.before.data.transactions.find(t=>t.id===state.modifiedId).title});
    await restart(); const restored=await snapshot(); sameData(restored.data,state.backup.data); assert.equal(restored.id,state.before.id);
    const originals=await page.evaluate(id=>Object.keys(localStorage).filter(k=>k.startsWith(`memoney:guest:${id}:pre-restore:`)).map(k=>JSON.parse(localStorage.getItem(k))),state.before.id);
    assert(originals.some(data=>JSON.stringify(data.transactions)===JSON.stringify(state.beforeImport.data.transactions)));
    const screenshot=webUiArtifact('physical-recovery-final.png'); await page.screenshot({path:screenshot});
    state.imported=true; writeFileSync(statePath,JSON.stringify(state,null,2),'utf8');
    console.log(JSON.stringify({phase,androidDocumentFileRoundTrip:true,restoredDataPreservedAfterRestart:true,preRestoreOriginalRetained:true,productionDBAccess:false,screenshot}));
  }
} finally {await browser?.disconnect();if(port)try{run('forward','--remove','tcp:'+port);}catch{}}
