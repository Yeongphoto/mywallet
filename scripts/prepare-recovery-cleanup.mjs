import {readFileSync,writeFileSync,mkdtempSync,cpSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
const databases=JSON.parse(readFileSync('scripts/hosted-databases.json','utf8'));
for(const key of ['auth','personal','shared'])if(databases[key]?.name!==`memoney-${key}`||!/^[-a-f0-9]{36}$/i.test(databases[key].id))throw Error('INVALID_DATABASE');
mkdirSync('android/build',{recursive:true});const runtime=mkdtempSync(resolve('android/build/recovery-cleanup-'));
cpSync('server',join(runtime,'server'),{recursive:true});
writeFileSync(join(runtime,'wrangler.json'),JSON.stringify({name:'memoney-recovery-cleanup',main:'server/wallet/recovery-cleanup.ts',compatibility_date:'2024-01-01',triggers:{crons:['17 * * * *']},d1_databases:['auth','personal','shared'].map(key=>({binding:key.toUpperCase(),database_name:databases[key].name,database_id:databases[key].id}))},null,2),'utf8');
console.log(JSON.stringify({runtime,databases:['memoney-personal','memoney-shared'],schedule:'Hourly; only expired recovery copies / expired archived shared financial rows'}));
