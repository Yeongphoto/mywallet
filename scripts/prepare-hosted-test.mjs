import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Hosted app deployment. Database names are platform-neutral; keep the installed
// app origin and legacy isolation bindings stable. Never use the old web config.
const root = resolve('.'), origin = 'https://memoney-android-test.pages.dev';
const databases = JSON.parse(readFileSync('scripts/hosted-databases.json','utf8'));
const databaseId = databases.auth.id;
const connection = JSON.parse(readFileSync('.android-tools/shared-wallet.json','utf8'));
const personalPath = '.android-tools/personal-test-wallet.json';
// Missing isolation configuration must stop deployment, never restore the web bridge.
const personal = JSON.parse(readFileSync(personalPath,'utf8'));
const native = JSON.parse(readFileSync('capacitor.config.json','utf8'));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
for (const role of ['auth','personal','shared']) {
  if (!uuid.test(databases[role]?.id) || databases[role]?.name !== `memoney-${role}`) throw Error('Unexpected hosted database configuration');
}
if (connection.origin !== 'https://mywallet-8mx.pages.dev' || !uuid.test(connection.ownerUserId) || !uuid.test(connection.ledgerId) ||
    native.server.url !== `${origin}/signin`) throw Error('Unexpected test deployment target');
if (personal && (personal.databaseId !== databases.personal.id ||
    personal.databaseName !== databases.personal.name || !uuid.test(personal.ledgerId) ||
    personal.ledgerId === connection.ledgerId || personal.ownerUserId !== connection.ownerUserId)) throw Error('Unexpected personal test database');
mkdirSync('android/build',{recursive:true});
const runtime = mkdtempSync(resolve('android/build/hosted-test-'));
cpSync('dist',join(runtime,'dist'),{recursive:true});
cpSync('functions/api/auth',join(runtime,'functions/api/auth'),{recursive:true});
cpSync('functions/api/wallet',join(runtime,'functions/api/wallet'),{recursive:true});
cpSync('server',join(runtime,'server'),{recursive:true});
// The isolated route imports the existing financial handler; preserve that handler
// under a separate module so /api/data cannot recurse into itself.
cpSync('functions/api/data.ts',join(runtime,'server/wallet/legacy-data.ts'));
const bridgePath = join(runtime,'server/wallet/shared-web.ts');
writeFileSync(bridgePath,readFileSync(bridgePath,'utf8').replace("../../functions/api/data.ts", "./legacy-data.ts"),'utf8');
cpSync('node_modules/jose',join(runtime,'node_modules/jose'),{recursive:true});
writeFileSync(join(runtime,'functions/api/data.ts'), "import { sharedWalletData } from '../../server/wallet/shared-web.ts';\nexport const onRequest = (context) => sharedWalletData(context.request, context.env);\n",'utf8');
writeFileSync(join(runtime,'functions/api/android-development.ts'), "export const onRequestGet = () => Response.json({environment:'memoney-android-test'});\n",'utf8');
const config = { name:'memoney-android-test', compatibility_date:'2024-01-01', pages_build_output_dir:'dist',
  d1_databases:[{binding:'DB',database_name:databases.auth.name,database_id:databaseId}],
  vars:{AUTH_ENABLED:'true',AUTH_GOOGLE_CLIENT_ID:native.plugins.MemoneyGoogleAuth.webClientId,
    AUTH_GOOGLE_ANDROID_CLIENT_ID:native.plugins.MemoneyGoogleAuth.androidClientId,AUTH_ORIGIN:origin,
    AUTH_LEDGER_INVITES:'true',AUTH_SHARED_TEST_DEPLOYMENT:'true',AUTH_SHARED_WALLET_ORIGIN:connection.origin,
    AUTH_SHARED_WALLET_LEDGER_ID:connection.ledgerId} };
if (personal) {
  config.d1_databases.push({binding:'TEST_FINANCE',database_name:personal.databaseName,database_id:personal.databaseId});
  config.vars.AUTH_TEST_PERSONAL_LEDGER='true';
  config.vars.AUTH_TEST_MULTI_LEDGER='true';
  config.vars.AUTH_LEDGER_RECOVERY='true';
  config.d1_databases.push({binding:'TEST_SHARED_FINANCE',database_name:databases.shared.name,database_id:databases.shared.id});
  config.vars.AUTH_SHARED_WALLET_LEDGER_ID=personal.ledgerId;
  delete config.vars.AUTH_SHARED_WALLET_ORIGIN;
}
writeFileSync(join(runtime,'wrangler.json'),JSON.stringify(config,null,2)+'\n','utf8');

// Preserve the existing verified Google subject and owner/ledger UUIDs. No sessions,
// challenges, emails, local financial rows, or pending operations are exported.
const localFolder = join(process.env.LOCALAPPDATA,'Memoney/auth-sandbox/c785e1399c20/v3/d1/miniflare-D1DatabaseObject');
let identity;
for(const file of readdirSync(localFolder).filter(file=>file.endsWith('.sqlite') && file!=='metadata.sqlite')) {
  const local = new DatabaseSync(join(localFolder,file),{readOnly:true});
  try { identity = local.prepare("SELECT issuer,subject FROM auth_identities WHERE user_id=? AND issuer='https://accounts.google.com'").get(connection.ownerUserId); }
  catch { /* Ignore unrelated local metadata DBs. */ } finally { local.close(); }
  if(identity) break;
}
if(!identity || !identity.subject) throw Error('Previously verified owner identity is required');
const quote = value => "'"+String(value).replaceAll("'","''")+"'";
const now=Date.now();
const schema = readFileSync('scripts/auth-foundation-schema.sql','utf8')+'\n'+readFileSync('scripts/ledger-invitations-schema.sql','utf8');
const seed = `\nINSERT INTO users(id,status,created_at) VALUES(${quote(connection.ownerUserId)},'active',${now});
INSERT INTO auth_identities(issuer,subject,user_id,created_at) VALUES(${quote(identity.issuer)},${quote(identity.subject)},${quote(connection.ownerUserId)},${now});
INSERT INTO ledgers(id,owner_user_id,name,created_at) VALUES(${quote(connection.ledgerId)},${quote(connection.ownerUserId)},'Shared wallet',${now});
INSERT INTO ledger_memberships(ledger_id,user_id,role,created_at) VALUES(${quote(connection.ledgerId)},${quote(connection.ownerUserId)},'owner',${now});\n`;
writeFileSync(join(runtime,'auth-initialization.sql'),schema+seed,{encoding:'utf8',flag:'wx'});
writeFileSync('.android-tools/hosted-test-runtime.json',JSON.stringify({runtime,origin,databaseId},null,2)+'\n','utf8');
console.log(JSON.stringify({runtime,origin,databaseId,ownerIdentityVerified:true,financialRowsCopied:0,
  personalTestDatabase:personal?.databaseName || null}));
