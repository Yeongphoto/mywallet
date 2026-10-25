import {cpSync,readFileSync,writeFileSync,mkdtempSync,readdirSync,mkdirSync} from 'node:fs';
import {join,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const baseline=JSON.parse(readFileSync(join(root,'android/build/asset-opening-runtime.json'),'utf8')).directory;
const config=JSON.parse(readFileSync(join(baseline,'wrangler.json'),'utf8'));
const expected=JSON.parse(readFileSync(join(root,'config/android-internal.json'),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
if(config.name!=='memoney-android-test'||config.vars.AUTH_ORIGIN!==expected.apiOrigin||config.vars.AUTH_PERSONAL_ONBOARDING==='true'||config.vars.BILLING_ENABLED==='true')throw Error('Unexpected live baseline');
for(const id of Object.values(expected.databaseIds))if(!config.d1_databases.some(db=>db.database_id===id))throw Error('Common DB mismatch');
const response=await fetch(expected.apiOrigin+'/',{cache:'no-store',signal:AbortSignal.timeout(15000)});
if(!response.ok||hash(Buffer.from(await response.arrayBuffer()))!==hash(readFileSync(join(baseline,'dist/index.html'))))throw Error('Canonical static deployment changed');
const directory=mkdtempSync(join(root,'android/build/account-membership-runtime-'));
for(const folder of ['dist','functions','server','node_modules/jose'])cpSync(join(baseline,folder),join(directory,folder),{recursive:true});
const added=['functions/api/account/membership.ts','functions/api/account/manage.ts',
  ...['account-benefits','membership','account-management','store','annual','policy'].map(name=>'server/billing/'+name+'.ts')];
for(const file of added){mkdirSync(dirname(join(directory,file)),{recursive:true});cpSync(join(root,file),join(directory,file));}
config.vars.ACCOUNT_MANAGEMENT_ENABLED='true';writeFileSync(join(directory,'wrangler.json'),JSON.stringify(config,null,2)+'\n','utf8');
for(const folder of ['dist','functions','server'])for(const entry of readdirSync(join(baseline,folder),{recursive:true,withFileTypes:true}).filter(entry=>entry.isFile())){
  const original=join(entry.parentPath||entry.path,entry.name),file=relative(baseline,original);
  if(hash(readFileSync(original))!==hash(readFileSync(join(directory,file))))throw Error('Unexpected baseline overwrite: '+file);
}
const receipt={directory,baseline,added,changedVars:['ACCOUNT_MANAGEMENT_ENABLED'],financialFilesPreserved:true,deployed:false,databaseWrites:0};
writeFileSync(join(root,'android/build/account-membership-runtime.json'),JSON.stringify(receipt,null,2)+'\n','utf8');
console.log(JSON.stringify(receipt));
