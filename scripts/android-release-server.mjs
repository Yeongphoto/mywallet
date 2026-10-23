import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDevelopmentConfig, assertDevelopmentConfig, releaseConfigErrors } from './android-build-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const canonicalIds = {
  auth: 'ec28198a-6040-4074-a142-1cf6f76c7f15',
  personal: 'a4113709-d951-4b50-aa78-cc80eb7cda9f',
  shared: '0a69096e-4d87-423e-b4a2-6afc0fb94698',
};

export function releaseServerDraft(profile, development, databases, personal) {
  const errors = releaseConfigErrors(profile, development).filter(error => !error.startsWith('Pending:'));
  for (const role of ['auth', 'personal', 'shared']) {
    if (databases[role]?.id !== canonicalIds[role] || databases[role]?.name !== `memoney-${role}`) errors.push(`Common database mismatch: ${role}`);
  }
  if (personal.databaseId !== canonicalIds.personal || personal.databaseName !== 'memoney-personal' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(personal.ledgerId || '')) errors.push('Configured personal ledger mapping is required');
  if (errors.length) throw Error(errors.join('\n'));
  const vars = {
    AUTH_ENABLED: 'false', // Draft only: no automatic login/traffic activation.
    AUTH_ORIGIN: profile.hosting.origin,
    AUTH_GOOGLE_CLIENT_ID: profile.plugins.MemoneyGoogleAuth.webClientId,
    AUTH_BROWSER_LOGIN: 'true', AUTH_LEDGER_INVITES: 'true', AUTH_LEDGER_RECOVERY: 'true',
    AUTH_RELEASE_DEPLOYMENT: 'true',
    AUTH_SHARED_TEST_DEPLOYMENT: 'true', AUTH_TEST_PERSONAL_LEDGER: 'true', AUTH_TEST_MULTI_LEDGER: 'true',
    AUTH_SHARED_WALLET_LEDGER_ID: personal.ledgerId,
    AUTH_PERSONAL_ONBOARDING: 'false', // Separate approved schema/rollout required.
  };
  if (profile.plugins.MemoneyGoogleAuth.androidClientId) vars.AUTH_GOOGLE_ANDROID_CLIENT_ID = profile.plugins.MemoneyGoogleAuth.androidClientId;
  return {
    name: profile.hosting.project, compatibility_date: '2024-01-01',
    // Intentionally absent output folder: not a deployable runtime/config.
    pages_build_output_dir: 'NOT_PREPARED_FOR_DEPLOYMENT',
    d1_databases: [['auth', 'DB'], ['personal', 'TEST_FINANCE'], ['shared', 'TEST_SHARED_FINANCE']]
      .map(([role, binding]) => ({ binding, database_name: databases[role].name, database_id: databases[role].id })),
    vars,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw Error('This command only prepares a server configuration draft');
  assertDevelopmentConfig(root);
  const json = file => JSON.parse(readFileSync(join(root, file), 'utf8'));
  const draft = releaseServerDraft(json('config/android-release.json'), readDevelopmentConfig(root).capacitor,
    json('scripts/hosted-databases.json'), json('.android-tools/personal-test-wallet.json'));
  const parent = join(root, 'android/build');
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, 'memoney-server-preparation-'));
  writeFileSync(join(directory, 'wrangler.draft.json'), JSON.stringify(draft, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  console.log(`Server configuration draft: ${directory}`);
  console.log('Authentication disabled. No deployment, DB queries/writes, schema initialization, or OAuth changes performed.');
}
