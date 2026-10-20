import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ensureMedium} from './android-emulator-runtime.mjs';
function fixture({ready=false,existing=[],becomesReadyAt=Infinity,refuseStop=false,failStart=false}={}){
 let clock=0,started=false,processes=[...existing];
 const calls={stops:[],starts:0};
 return {calls,io:{log:()=>{},now:()=>clock,wait:async ms=>{clock+=ms;},
  probe:()=>ready||((started||existing.length)&&clock>=becomesReadyAt)?'emulator-5554':null,
  processes:()=>processes.map(p=>({...p,ageMs:p.ageMs+clock})),
  stop:p=>{calls.stops.push(p.id);if(!refuseStop)processes=processes.filter(v=>v.id!==p.id);},
  start:async()=>{calls.starts++;started=true;if(failStart)throw Error('spawn failed');}}};
}
const old={id:42,started:'creation-identity',ageMs:120000};
test('a healthy device is reused without stopping or starting anything',async()=>{
 const f=fixture({ready:true,existing:[old]});assert.equal(await ensureMedium(f.io),'emulator-5554');assert.deepEqual(f.calls,{stops:[],starts:0});
});
test('a device still booting is allowed to finish without a duplicate or restart',async()=>{
 const f=fixture({existing:[{...old,ageMs:5000}],becomesReadyAt:12000});await ensureMedium(f.io);assert.deepEqual(f.calls,{stops:[],starts:0});
});
test('a missing device cold boots once',async()=>{
 const f=fixture({becomesReadyAt:15000});await ensureMedium(f.io);assert.deepEqual(f.calls,{stops:[],starts:1});
});
test('a stale target process gets one cold restart',async()=>{
 const f=fixture({existing:[old],becomesReadyAt:15000});await ensureMedium(f.io);assert.deepEqual(f.calls,{stops:[42],starts:1});
});
test('a process that cannot be stopped never creates a duplicate',async()=>{
 const f=fixture({existing:[old],refuseStop:true});await assert.rejects(ensureMedium(f.io),/Refusing to start a duplicate/);assert.equal(f.calls.starts,0);
});
test('a process identity verification failure stops recovery before booting',async()=>{
 const f=fixture({existing:[old]});f.io.stop=()=>{throw Error('Process identity changed');};await assert.rejects(ensureMedium(f.io),/identity changed/);assert.equal(f.calls.starts,0);
});
test('a failed cold boot is not restarted in a loop',async()=>{
 const f=fixture({existing:[old]});await assert.rejects(ensureMedium(f.io),/No further restart/);assert.deepEqual(f.calls,{stops:[42],starts:1});
});
test('a spawn error is reported without repeated launches',async()=>{
 const f=fixture({failStart:true});await assert.rejects(ensureMedium(f.io),/spawn failed/);assert.equal(f.calls.starts,1);
});
test('permission failures do not restart any device',async()=>{
 const f=fixture({existing:[old]});f.io.probe=()=>{throw Error('EPERM');};await assert.rejects(ensureMedium(f.io),/EPERM/);assert.deepEqual(f.calls,{stops:[],starts:0});
});
