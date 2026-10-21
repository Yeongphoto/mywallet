import {appendFileSync,existsSync,mkdirSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import {root,checkTools,runtimeStatus,readyMedium,ensureMedium,attachMedium,delay} from './android-emulator-runtime.mjs';
checkTools();
const folder=join(root,'android','build');mkdirSync(folder,{recursive:true});
const lock=join(folder,'emulator-autoconnect.pid');
const stop=join(folder,'emulator-autoconnect.stop');
// Windows releases this pipe when the process exits, including power loss.
// A PID file from yesterday must never block today's startup after PID reuse.
const name=createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0,16);
const singleton=createServer(socket=>socket.destroy());
try{
  await new Promise((resolve,reject)=>{singleton.once('error',reject);singleton.listen(`\\\\.\\pipe\\memoney-emulator-${name}`,resolve);});
}catch(error){if(error.code==='EADDRINUSE')process.exit(0);throw error;}
writeFileSync(lock,String(process.pid),'utf8');
const log=message=>appendFileSync(join(folder,'emulator-autoconnect.log'),`${new Date().toISOString()} ${message}\n`,'utf8');
let attachedRuntime=null,attachedSerial=null,retryAt=0,repairAt=0,lastError='';
const report=error=>{if(error.message!==lastError){log(error.message);lastError=error.message;}};
try{
  log(`Auto-connect started (PID ${process.pid}). Waiting for Orca.`);
  do{
    if(existsSync(stop))break;
    let runtime=null;
    try{runtime=runtimeStatus();}catch(error){report(error);}
    if(!runtime){attachedRuntime=null;attachedSerial=null;retryAt=0;}
    else if(Date.now()>=retryAt){
      try{
        const current=readyMedium();
        if(runtime!==attachedRuntime||!current||current!==attachedSerial){
          if(runtime!==attachedRuntime)log(`Desktop session detected: ${runtime}; device=${current||'not ready'}.`);
          if(current||Date.now()>=repairAt){
            if(!current)repairAt=Date.now()+5*60*1000;
            const serial=current||await ensureMedium({log});
            attachMedium(serial,{launch:!current});
            attachedRuntime=runtime;attachedSerial=serial;lastError='';
            log(`Attached ${serial} to the Memoney workspace.`);
          }
        }
      }catch(error){report(error);retryAt=Date.now()+5*60*1000;}
    }
    if(process.argv.includes('--once'))break;
    await delay(20000);
  }while(true);
}finally{
  if(existsSync(lock)&&readFileSync(lock,'utf8')===String(process.pid))unlinkSync(lock);
  singleton.close();
  log('Auto-connect stopped.');
}
