import {execFileSync,spawn} from 'node:child_process';
import {existsSync,mkdirSync,openSync,closeSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const name='Memoney_Unfolded_4_3';
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT||path.join(process.env.LOCALAPPDATA,'Android','Sdk');
const adb=path.join(sdk,'platform-tools','adb.exe');
const mirror=path.join(root,'.android-tools','scrcpy-5.0.1','scrcpy-win64-v5.0.1','scrcpy.exe');
if(!existsSync(path.join(process.env.USERPROFILE,'.android','avd',`${name}.ini`))||!existsSync(mirror))throw Error('The unfolded AVD and local scrcpy installation are required. See Docs/android-emulator-connection.md.');
const run=(...args)=>execFileSync(adb,args,{encoding:'utf8',windowsHide:true,timeout:15000,stdio:['ignore','pipe','pipe']}).trim();
const processes=()=>JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',"@(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(emulator|qemu-system-x86_64(-headless)?|scrcpy)\\.exe$' } | Select-Object Name,CommandLine) | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true})||'[]');
function detached(executable,args,label){
 mkdirSync(path.join(root,'android','build'),{recursive:true});
 const out=openSync(path.join(root,'android','build',`${label}-${Date.now()}.log`),'a');
 try{const child=spawn(executable,args,{cwd:root,detached:true,windowsHide:true,stdio:['ignore',out,out]});child.unref();}finally{closeSync(out);}
}
function findReady(){
 for(const row of run('devices').split(/\r?\n/)){
  const match=row.match(/^(emulator-\d+)\s+device\b/);if(!match)continue;
  try{if(run('-s',match[1],'shell','getprop','ro.boot.qemu.avd_name')===name&&run('-s',match[1],'shell','getprop','sys.boot_completed')==='1')return match[1];}catch{}
 }
}
let serial=findReady();
if(!serial){
 const list=[processes()].flat();
 if(!list.some(p=>p.CommandLine?.includes(`-avd ${name}`)))detached(path.join(sdk,'emulator','emulator.exe'),['-avd',name,'-gpu','swiftshader','-no-window','-no-snapshot-load','-no-snapshot-save','-no-boot-anim'],'unfolded-boot');
 console.log('Waiting for the separate unfolded device. Medium Phone stays running.');
 const deadline=Date.now()+120000;
 while(!serial&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,2000));serial=findReady();}
 if(!serial)throw Error('Unfolded device did not finish booting. Existing devices were not restarted.');
}
run('-s',serial,'shell','wm','size','2048x1536');run('-s',serial,'shell','wm','density','320');
run('-s',serial,'shell','settings','put','system','accelerometer_rotation','0');run('-s',serial,'shell','settings','put','system','user_rotation','0');
if(!run('-s',serial,'shell','pm','path','com.mywallet.dev')){
 const apk=path.join(root,'android','build','exports','Memoney-loading-0.3.3.apk');
 if(!existsSync(apk))throw Error('Existing test APK is missing. No new APK was built.');
 run('-s',serial,'install','-r',apk);
}
run('-s',serial,'shell','am','start','-n','com.mywallet.dev/.MainActivity');
if(![processes()].flat().some(p=>p.Name==='scrcpy.exe'&&p.CommandLine?.includes('--window-title=Memoney_Unfolded_4_3'))){
 detached(mirror,[`--serial=${serial}`,'--window-title=Memoney_Unfolded_4_3','--window-width=900','--window-height=675','--window-x=40','--window-y=80','--no-audio','--max-fps=30','--video-codec=h264'],'unfolded-window');
}
console.log(JSON.stringify({device:serial,avd:name,resolution:'2048x1536',density:320,mediumPhonePreserved:true}));
