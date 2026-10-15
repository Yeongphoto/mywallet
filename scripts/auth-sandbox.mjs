import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { prepareSandbox, runWrangler, sandboxPaths } from './dev-sandbox.mjs';

if (process.argv.length > 2) throw new Error('Auth sandbox accepts no config/remote overrides');
const paths = sandboxPaths();
const state = join(dirname(dirname(paths.state)), 'auth-sandbox', basename(paths.state));
const marker = join(state, 'initialized.json');
const existed = existsSync(state);
if (existed && !existsSync(marker)) throw new Error('Unmarked auth sandbox exists; inspect it without overwriting');
const { runtime } = prepareSandbox();
writeFileSync(join(runtime, 'functions', 'api', 'android-development.ts'),
  'export const onRequestGet = () => Response.json({ environment: "mywallet-auth-local", port: 5187 });\n', 'utf8');
// The local bridge is authenticated and explicitly mapped to the existing shared web wallet.
writeFileSync(join(runtime, 'functions', 'api', 'data.ts'), `
import { sharedWalletData } from '../../server/wallet/shared-web.ts';
export const onRequest = (context) => sharedWalletData(context.request, context.env);
`, 'utf8');
if (!existed) {
  mkdirSync(dirname(state), { recursive: true });
  mkdirSync(state);
  runWrangler(['d1', 'execute', 'memoney-sandbox-local', '--local', '--persist-to', state,
    '--file', join(paths.root, 'scripts', 'auth-foundation-schema.sql')], runtime);
  writeFileSync(marker, JSON.stringify({ environment: 'mywallet-auth-local', createdAt: new Date().toISOString() }) + '\n', 'utf8');
}
// Explicit, additive local metadata migration. Financial tables are untouched.
const inviteMarker = join(state, 'ledger-invitations-v1.json');
if (!existsSync(inviteMarker)) {
  runWrangler(['d1', 'execute', 'memoney-sandbox-local', '--local', '--persist-to', state,
    '--file', join(paths.root, 'scripts', 'ledger-invitations-schema.sql')], runtime);
  writeFileSync(inviteMarker, JSON.stringify({ version: 1, appliedAt: Date.now() }) + '\n', 'utf8');
}
// Only public client ID is accepted. No secrets or .dev.vars are copied.
const nativeConfig = JSON.parse(readFileSync(join(paths.root, 'capacitor.config.json'), 'utf8'));
const clientId = process.env.MYWALLET_GOOGLE_CLIENT_ID || nativeConfig.plugins?.MemoneyGoogleAuth?.webClientId;
const androidClientId = nativeConfig.plugins?.MemoneyGoogleAuth?.androidClientId;
if (clientId && !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error('Invalid Google OAuth client ID');
if (androidClientId && !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(androidClientId)) throw new Error('Invalid Android OAuth client ID');
const config = clientId ? { AUTH_ENABLED: 'true', AUTH_GOOGLE_CLIENT_ID: clientId,
  AUTH_ORIGIN: 'http://localhost:5187', AUTH_LOCAL_DEV: 'true', AUTH_LEDGER_INVITES: 'true' } : {};
if (clientId && androidClientId) config.AUTH_GOOGLE_ANDROID_CLIENT_ID = androidClientId;
const connectionFile = join(paths.root, '.android-tools', 'shared-wallet.json');
if (existsSync(connectionFile)) {
  if (!clientId) throw new Error('Google login must be configured before connecting a wallet');
  const connection = JSON.parse(readFileSync(connectionFile, 'utf8'));
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const origin = new URL(connection.origin);
  if (!uuid.test(connection.ownerUserId) || !uuid.test(connection.ledgerId) || origin.protocol !== 'https:' ||
      origin.origin !== connection.origin || !(origin.hostname === 'mywallet-8mx.pages.dev' || origin.hostname.endsWith('.mywallet-8mx.pages.dev'))) {
    throw new Error('Invalid shared wallet connection');
  }
  const sql = join(runtime, 'shared-wallet-membership.sql');
  const now = Date.now();
  // Add metadata only for the explicitly verified existing user. No first-signup assignment.
  writeFileSync(sql, `INSERT OR IGNORE INTO ledgers (id, owner_user_id, name, created_at)
    SELECT '${connection.ledgerId}', id, 'Shared wallet', ${now} FROM users WHERE id = '${connection.ownerUserId}' AND status = 'active';
    INSERT OR IGNORE INTO ledger_memberships (ledger_id, user_id, role, created_at)
    SELECT id, owner_user_id, 'owner', ${now} FROM ledgers WHERE id = '${connection.ledgerId}' AND owner_user_id = '${connection.ownerUserId}';\n`, 'utf8');
  runWrangler(['d1', 'execute', 'memoney-sandbox-local', '--local', '--persist-to', state, '--file', sql], runtime);
  config.AUTH_SHARED_WALLET_ORIGIN = origin.origin;
  config.AUTH_SHARED_WALLET_LEDGER_ID = connection.ledgerId;
}
writeFileSync(join(runtime, '.dev.vars'), Object.entries(config).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', 'utf8');
console.log(config.AUTH_SHARED_WALLET_ORIGIN ? 'Local authenticated connection to the existing shared web wallet on port 5187.' :
  'Local auth foundation on port 5187. Financial data API is blocked until a wallet is explicitly connected.');
runWrangler(['pages', 'dev', 'dist', '--ip', '127.0.0.1', '--port', '5187', '--persist-to', state], runtime);
