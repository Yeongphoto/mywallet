// Only the document dialog opened by the separate probe's staged test.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDevices, selectPhysicalDevice } from './android-device-preflight.mjs';
assert.equal(process.argv.length,6);assert.equal(process.argv[2],'--serial');assert.equal(process.argv[4],'--action');
const serial=process.argv[3], action=process.argv[5]; assert(['save','inspect','search','select'].includes(action));
const adb=join(process.env.LOCALAPPDATA,'Android/Sdk/platform-tools/adb.exe');
selectPhysicalDevice(parseDevices(execFileSync(adb,['devices','-l'],{encoding:'utf8'})),serial);
const run=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const state=JSON.parse(readFileSync('android/build/physical-recovery-session.json','utf8'));
assert.equal(state.appId,'com.memoney.probe'); assert(/^memoney-probe-roundtrip-[a-f0-9]{8}\.json$/.test(state.filename));
function nodes(){
  run('shell','uiautomator','dump','/data/local/tmp/memoney-probe-ui.xml');
  const xml=run('exec-out','cat','/data/local/tmp/memoney-probe-ui.xml');
  run('shell','rm','-f','/data/local/tmp/memoney-probe-ui.xml');
  return [...xml.matchAll(/<node\b[^>]*>/g)].map(x=>Object.fromEntries([...x[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]])));
}
function tap(node){assert(node,'Expected document control missing');assert.equal(node.package,'com.google.android.documentsui');const b=node.bounds.match(/\d+/g).map(Number);run('shell','input','tap',String((b[0]+b[2])>>1),String((b[1]+b[3])>>1));}
let ui=nodes();assert(ui.some(n=>n.package==='com.google.android.documentsui'),'Do not operate any other app');
if(action==='save'){
  assert(ui.some(n=>n['resource-id'].endsWith('/breadcrumb_text')&&n.text==='다운로드'),'Select Downloads explicitly first');
  run('shell','test','!','-e','/sdcard/Download/'+state.filename);
  const field=ui.find(n=>n.class==='android.widget.EditText'&&n.text.startsWith('memoney-local-backup-'));tap(field);
  run('shell','input','keycombination','KEYCODE_CTRL_LEFT','KEYCODE_A');run('shell','input','text',state.filename);
  ui=nodes();assert(ui.some(n=>n.class==='android.widget.EditText'&&n.text===state.filename),'Filename did not match; do not save');
  tap(ui.find(n=>n['resource-id']==='android:id/button1'&&n.text==='저장'));
  console.log('Saved only the unique synthetic backup in Downloads');
}else if(action==='search'){
  if(!ui.some(n=>/search_src_text$/.test(n['resource-id']))) {
    tap(ui.find(n=>/검색|Search/.test(n['content-desc'])||/menu_search$/.test(n['resource-id'])));ui=nodes();
  }
  const field=ui.find(n=>/search_src_text$/.test(n['resource-id']));tap(field);run('shell','input','keycombination','KEYCODE_CTRL_LEFT','KEYCODE_A');run('shell','input','text',state.filename);run('shell','input','keyevent','KEYCODE_ENTER');
  console.log('Searched only for the verified synthetic filename');
}else if(action==='select'){
  tap(ui.find(n=>n.text===state.filename&&n['resource-id']==='android:id/title'&&n.class==='android.widget.TextView'));console.log('Selected the verified synthetic backup');
}else{
  // Never print the user's unrelated document filenames or directory listing.
  console.log(ui.filter(n=>n.class==='android.widget.EditText'||n.class==='android.widget.Button'||n.text===state.filename||/toolbar|search|breadcrumb/.test(n['resource-id'])).map(n=>({text:n.text,id:n['resource-id'],class:n.class,description:n['content-desc'],bounds:n.bounds})));
}
