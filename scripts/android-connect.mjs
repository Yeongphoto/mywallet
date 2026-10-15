import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

// Restore this workspace's selected device through Orca's public CLI.
// Never wipe AVD data, change accounts, or touch other emulators/physical phones.
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT||join(process.env.LOCALAPPDATA||'','Android','Sdk');
const adb=join(sdk,'platform-tools','adb.exe'),emulator=join(sdk,'emulator','emulator.exe');
if(process.platform!=='win32'||!existsSync(adb)||!existsSync(emulator))throw Error('This workspace reconnect helper requires the Windows Android SDK');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function run(command,args,timeout=8000){const r=spawnSync(command,args,{encoding:'utf8',windowsHide:true,timeout});if(r.error||r.status!==0)throw Error(r.stderr?.trim()||r.error?.message||'Command failed');return r.stdout.trim();}
function readyDevice(){
  const lines=run(adb,['devices']).split(/\r?\n/).filter(line=>/^emulator-\d+\s+device\b/.test(line));
  for(const line of lines){const serial=line.split(/\s+/)[0];
    try{const name=run(adb,['-s',serial,'shell','getprop','ro.boot.qemu.avd_name']) || run(adb,['-s',serial,'shell','getprop','ro.kernel.qemu.avd_name']);
      if(name==='Medium_Phone'&&run(adb,['-s',serial,'shell','getprop','sys.boot_completed'])==='1')return serial;}catch{}
  }return null;
}
let serial=readyDevice();
if(!serial){
  // First allow an already booting device to finish, without starting a duplicate.
  console.log('Checking the existing Medium_Phone connection...');
  for(let n=0;n<5&&!serial;n++){await delay(2000);serial=readyDevice();}
}
if(!serial){
  const query="Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(emulator|qemu-system-x86_64(?:-headless)?)\\.exe$' -and $_.CommandLine -match '(?:^|\\s)-avd\\s+Medium_Phone(?:\\s|$)' } | Select-Object -ExpandProperty ProcessId";
  const ids=run('powershell.exe',['-NoProfile','-Command',query]).split(/\s+/).filter(Boolean);
  if(ids.length){
    console.log('Medium_Phone is already running; waiting without starting a duplicate.');
    for(let n=0;n<60&&!serial;n++){await delay(2000);serial=readyDevice();if(n%5===4)console.log('Waiting for the existing Android device...');}
    if(!serial)throw Error('Existing Medium_Phone is not responding. No device was stopped or reset.');
  }
  if(!serial){
  const folder=join(root,'android','build');mkdirSync(folder,{recursive:true});
  const stamp=Date.now(),out=openSync(join(folder,`emulator-connect-${stamp}.log`),'wx'),err=openSync(join(folder,`emulator-connect-${stamp}.error.log`),'wx');
  console.log('Starting Medium_Phone with cold boot and software graphics. Device data is preserved.');
  const child=spawn(emulator,['-avd','Medium_Phone','-gpu','swiftshader','-no-window','-no-snapshot-load','-no-snapshot-save','-no-boot-anim'],{detached:true,windowsHide:true,stdio:['ignore',out,err]});
  child.on('error',error=>{console.error(error.message);process.exitCode=1;});child.unref();closeSync(out);closeSync(err);
  for(let n=0;n<60&&!serial;n++){await delay(2000);serial=readyDevice();if(n%5===4)console.log('Waiting for Android boot...');}
  if(!serial)throw Error('Medium_Phone did not finish booting. Inspect android/build/emulator-connect-*.log');
  }
}
console.log(`Connecting ${serial} to this Orca workspace...`);
const attached=JSON.parse(run('orca.exe',['emulator','attach',serial,'--worktree',`path:${root}`,'--focus','--json'],30000));
if(!attached.ok||!attached.result?.attached)throw Error(attached.error?.message||'Orca did not attach the device');
console.log(JSON.stringify(attached,null,2));
