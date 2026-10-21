import {checkTools,runtimeStatus,ensureMedium,attachMedium} from './android-emulator-runtime.mjs';
checkTools();
// Check Orca before changing any emulator process.
if(!runtimeStatus())throw Error('Orca is not ready. No emulator was changed.');
const serial=await ensureMedium();
console.log(JSON.stringify(attachMedium(serial,{focus:true,launch:true}),null,2));
