import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { prepareSandbox, sandboxPaths, runWrangler } from './dev-sandbox.mjs';

if (process.argv.length > 2) throw Error('No remote or configuration overrides are accepted');
const paths = sandboxPaths();
const state = join(dirname(dirname(paths.state)), 'web-auth-sandbox', basename(paths.state));
const marker = join(state, 'initialized-v1.json');
if (existsSync(state) && !existsSync(marker)) throw Error('Unmarked web sandbox exists; inspect without overwriting');
const clientId = process.env.MYWALLET_GOOGLE_CLIENT_ID;
if (clientId && !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw Error('Invalid Web client ID');
const { runtime } = prepareSandbox();
const config = {
  name: 'memoney-web-sandbox', compatibility_date: '2024-01-01', pages_build_output_dir: 'dist',
  d1_databases: [
    { binding: 'DB', database_name: 'memoney-web-auth-local', database_id: '00000000-0000-0000-0000-000000000001', remote: false },
    { binding: 'WEB_FINANCE', database_name: 'memoney-web-finance-local', database_id: '00000000-0000-0000-0000-000000000002', remote: false },
  ],
  vars: { AUTH_ENABLED: clientId ? 'true' : 'false', AUTH_WEB_WALLETS: 'true', AUTH_ORIGIN: 'http://localhost:5189', AUTH_LOCAL_DEV: 'true', AUTH_LEDGER_INVITES: 'true', ...(clientId ? { AUTH_GOOGLE_CLIENT_ID: clientId } : {}) },
};
writeFileSync(join(runtime, 'wrangler.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');
if (!existsSync(marker)) {
  mkdirSync(state, { recursive: true });
  const auth = ['auth-foundation-schema.sql', 'ledger-invitations-schema.sql', 'shared-creation-auth-schema.sql', 'web-wallet-auth-schema.sql']
    .map(file => readFileSync(join(paths.root, 'scripts', file), 'utf8')).join('\n');
  const authFile = join(runtime, 'auth-initialization.sql');
  writeFileSync(authFile, auth, { encoding: 'utf8', flag: 'wx' });
  runWrangler(['d1', 'execute', 'memoney-web-auth-local', '--local', '--persist-to', state, '--file', authFile], runtime);
  runWrangler(['d1', 'execute', 'memoney-web-finance-local', '--local', '--persist-to', state, '--file', join(paths.root, 'scripts/web-wallet-finance-schema.sql')], runtime);
  writeFileSync(marker, JSON.stringify({ version: 1, initializedAt: new Date().toISOString() }) + '\n', { encoding: 'utf8', flag: 'wx' });
}
console.log('Web-only auth/wallet sandbox: http://localhost:5189/signin. Local D1 only; no legacy data copied.');
if (!clientId) console.log('Google login disabled until MYWALLET_GOOGLE_CLIENT_ID is provided.');
runWrangler(['pages', 'dev', 'dist', '--ip', '127.0.0.1', '--port', '5189', '--persist-to', state], runtime);
