import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { prepareSandbox, sandboxPaths, runWrangler } from './dev-sandbox.mjs';

if (process.argv.length > 2) throw Error('No remote or configuration overrides are accepted');
const paths = sandboxPaths();
// New isolated fixture state; preserve the former WEB_FINANCE sandbox untouched.
const state = join(dirname(dirname(paths.state)), 'web-common-sandbox', basename(paths.state));
const marker = join(state, 'initialized-v2.json');
if (existsSync(state) && !existsSync(marker)) throw Error('Unmarked web sandbox exists; inspect without overwriting');
const clientId = process.env.MYWALLET_GOOGLE_CLIENT_ID;
if (clientId && !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw Error('Invalid Web client ID');
const { runtime } = prepareSandbox();
const config = {
  name: 'memoney-web-sandbox', compatibility_date: '2024-01-01', pages_build_output_dir: 'dist',
  d1_databases: [
    { binding: 'DB', database_name: 'memoney-web-auth-local', database_id: '00000000-0000-0000-0000-000000000001', remote: false },
    { binding: 'TEST_FINANCE', database_name: 'memoney-web-personal-local', database_id: '00000000-0000-0000-0000-000000000002', remote: false },
    { binding: 'TEST_SHARED_FINANCE', database_name: 'memoney-web-shared-local', database_id: '00000000-0000-0000-0000-000000000003', remote: false },
  ],
  vars: { AUTH_ENABLED: clientId ? 'true' : 'false', AUTH_ANDROID_DATA_COMPAT: 'true', AUTH_ORIGIN: 'http://localhost:5189', AUTH_LOCAL_DEV: 'true', AUTH_LEDGER_INVITES: 'true', AUTH_TEST_PERSONAL_LEDGER: 'true', AUTH_TEST_MULTI_LEDGER: 'true', AUTH_LEDGER_RECOVERY: 'true', AUTH_BROWSER_LOGIN: 'true', AUTH_SHARED_WALLET_LEDGER_ID: '99999999-9999-4999-8999-999999999999', ...(clientId ? { AUTH_GOOGLE_CLIENT_ID: clientId } : {}) },
};
writeFileSync(join(runtime, 'wrangler.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');
if (!existsSync(marker)) {
  mkdirSync(state, { recursive: true });
  const auth = ['auth-foundation-schema.sql', 'ledger-invitations-schema.sql', 'shared-creation-auth-schema.sql']
    .map(file => readFileSync(join(paths.root, 'scripts', file), 'utf8')).join('\n');
  const authFile = join(runtime, 'auth-initialization.sql');
  writeFileSync(authFile, auth, { encoding: 'utf8', flag: 'wx' });
  runWrangler(['d1', 'execute', 'memoney-web-auth-local', '--local', '--persist-to', state, '--file', authFile], runtime);
  const personalFile = join(runtime, 'personal-initialization.sql');
  writeFileSync(personalFile, readFileSync(join(paths.root, 'scripts/android-sandbox-schema.sql'), 'utf8') + "\nCREATE TABLE memoney_test_database(id TEXT PRIMARY KEY,ledger_id TEXT);\nINSERT INTO memoney_test_database VALUES('memoney-android-test-personal','99999999-9999-4999-8999-999999999999');\n", { encoding: 'utf8', flag: 'wx' });
  runWrangler(['d1', 'execute', 'memoney-web-personal-local', '--local', '--persist-to', state, '--file', personalFile], runtime);
  runWrangler(['d1', 'execute', 'memoney-web-shared-local', '--local', '--persist-to', state, '--file', join(paths.root, 'scripts/shared-creation-finance-schema.sql')], runtime);
  writeFileSync(marker, JSON.stringify({ version: 2, initializedAt: new Date().toISOString() }) + '\n', { encoding: 'utf8', flag: 'wx' });
}
console.log('Common-API web sandbox: http://localhost:5189/signin. Three local D1 fixtures only; no user identities or legacy data copied.');
if (!clientId) console.log('Google login disabled until MYWALLET_GOOGLE_CLIENT_ID is provided.');
runWrangler(['pages', 'dev', 'dist', '--ip', '127.0.0.1', '--port', '5189', '--persist-to', state], runtime);
