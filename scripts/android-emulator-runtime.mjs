import {existsSync,mkdirSync,openSync,closeSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';

export const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT||join(process.env.LOCALAPPDATA||'','Android','Sdk');
const adb=join(sdk,'platform-tools','adb.exe');
const emulator=join(sdk,'emulator','emulator.exe');
export const orca=process.env.ORCA_CLI_COMMAND||join(process.env.LOCALAPPDATA||'','Programs','orca','resources','bin','orca.exe');
const processHelper=join(root,'scripts','android-emulator-process.ps1');
export const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function run(command,args,timeout=6000){
  const result=spawnSync(command,args,{encoding:'utf8',windowsHide:true,timeout,cwd:root,maxBuffer:1024*1024});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error(result.stderr?.trim()||`Command failed (${result.status})`);
  return result.stdout.trim();
}
export function runtimeStatus(){
  const status=JSON.parse(run(orca,['status','--json'],5000));
  return status.ok&&status.result?.runtime?.reachable?status.result.runtime.runtimeId:null;
}
export function mediumProcesses(){
  return JSON.parse(run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',processHelper,'-Action','list']));
}
export function readyMedium(){
  const rows=run(adb,['devices'],3000).split(/\r?\n/);
  for(const row of rows){
    const match=row.match(/^(emulator-\d+)\s+device\b/);if(!match)continue;
    try{
      const name=run(adb,['-s',match[1],'shell','getprop','ro.boot.qemu.avd_name'],2000);
      if(name==='Medium_Phone'&&run(adb,['-s',match[1],'shell','getprop','sys.boot_completed'],2000)==='1')return match[1];
    }catch(error){
      // Permission/tool failures must never authorize a process restart.
      if(error.code!=='ETIMEDOUT'&&!/device .*offline|device .*not found|error: closed|transport.*closed/i.test(error.message))throw error;
    }
  }
  return null;
}
function startMedium(){
  const folder=join(root,'android','build');mkdirSync(folder,{recursive:true});
  const stamp=Date.now();const out=openSync(join(folder,`emulator-connect-${stamp}.log`),'wx');
  const err=openSync(join(folder,`emulator-connect-${stamp}.error.log`),'wx');
  try{
    const child=spawn(emulator,['-avd','Medium_Phone','-gpu','swiftshader','-no-window','-no-snapshot-load','-no-snapshot-save','-no-boot-anim'],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',out,err]});
    return new Promise((resolve,reject)=>{child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});
  }finally{closeSync(out);closeSync(err);}
}
const defaults={probe:readyMedium,processes:mediumProcesses,start:startMedium,wait:delay,now:()=>Date.now(),
  stop:p=>run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',processHelper,'-Action','stop','-ProcessId',String(p.id),'-StartedAt',p.started])};

// One operation permits at most one cold restart. The process helper rechecks
// both the exact AVD name and creation identity immediately before stopping it.
export async function ensureMedium({log=console.log,...injected}={}){
  const io={...defaults,...injected};
  let serial=io.probe();if(serial)return serial;
  let processes=io.processes();
  const deadline=io.now()+90000;
  if(processes.length&&processes.some(p=>p.ageMs<90000)){
    log('Waiting for the existing Medium_Phone boot.');
    while(io.now()<deadline){
      await io.wait(3000);serial=io.probe();if(serial)return serial;
      processes=io.processes();
      if(!processes.length||processes.every(p=>p.ageMs>=90000))break;
    }
  }
  if(processes.length){
    await io.wait(3000);serial=io.probe();if(serial)return serial;
    log('Medium_Phone is unresponsive. Restarting only this AVD; device data is preserved.');
    for(const process of processes)io.stop(process);
    await io.wait(2000);
    if(io.processes().length)throw Error('Medium_Phone did not stop. Refusing to start a duplicate.');
  }
  log('Cold booting Medium_Phone.');await io.start();
  const bootDeadline=io.now()+90000;
  while(io.now()<bootDeadline){
    await io.wait(3000);serial=io.probe();if(serial)return serial;
  }
  throw Error('Medium_Phone boot timed out. No further restart was attempted. See android/build/emulator-connect-*.log.');
}
export function attachMedium(serial,{focus=false,launch=false}={}){
  const args=['emulator','attach',serial,'--worktree',`path:${root}`,'--json'];if(focus)args.push('--focus');
  const result=JSON.parse(run(orca,args,15000));
  if(!result.ok||!result.result?.attached)throw Error(result.error?.message||'Orca did not attach the device');
  if(launch)run(adb,['-s',serial,'shell','am','start','-n','com.mywallet.dev/.MainActivity'],10000);
  return result;
}
export function checkTools(){
  if(process.platform!=='win32'||![adb,emulator,orca].every(existsSync))throw Error('Windows Android SDK and the Orca CLI are required.');
}
