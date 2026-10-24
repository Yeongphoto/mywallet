import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(path, 'utf8');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function internalAuthArtifacts(baseline, connection, databases, helper) {
  const config = JSON.parse(JSON.stringify(baseline));
  if (config.name !== 'memoney-android-test' || config.vars.AUTH_ORIGIN !== 'https://memoney-android-test.pages.dev' ||
      config.vars.AUTH_ENABLED !== 'true' || config.vars.AUTH_PERSONAL_ONBOARDING === 'true') throw Error('Unexpected live runtime; review before authentication patch');
  const roles = { auth: 'DB', personal: 'TEST_FINANCE', shared: 'TEST_SHARED_FINANCE' };
  for (const [role, binding] of Object.entries(roles)) {
    const db = config.d1_databases.find(row => row.binding === binding);
    if (!db || db.database_id !== databases[role].id || db.database_id !== connection.databaseIds[role] || db.database_name !== databases[role].name) throw Error('Common database mismatch');
  }
  if (!/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(connection.androidClientId)) throw Error('Invalid OAuth client');
  const clients = new Set((config.vars.AUTH_GOOGLE_ANDROID_CLIENT_IDS || '').split(',').filter(Boolean));
  clients.add(connection.androidClientId);
  config.vars.AUTH_GOOGLE_ANDROID_CLIENT_IDS = [...clients].join(',');
  const originalCheck = "  if (env.AUTH_GOOGLE_ANDROID_CLIENT_ID !== undefined &&\n      !/^[A-Za-z0-9_-]+\\.apps\\.googleusercontent\\.com$/.test(env.AUTH_GOOGLE_ANDROID_CLIENT_ID)) return null;";
  const originalParties = 'authorizedParties: env.AUTH_GOOGLE_ANDROID_CLIENT_ID ? [env.AUTH_GOOGLE_ANDROID_CLIENT_ID] : [],';
  let source = helper.baselineHttp.replaceAll('\r\n', '\n');
  if (!source.includes(originalCheck) || !source.includes(originalParties) || source.includes('androidAuthorizedParties')) throw Error('Frozen auth settings changed; review patch');
  source = "import { androidAuthorizedParties } from './android-clients.ts';\n" + source
    .replace('  AUTH_GOOGLE_ANDROID_CLIENT_ID?: string;', '  AUTH_GOOGLE_ANDROID_CLIENT_ID?: string;\n  AUTH_GOOGLE_ANDROID_CLIENT_IDS?: string;')
    .replace(originalCheck, '  const parties = androidAuthorizedParties(env);\n  if (!parties) return null;')
    .replace(originalParties, 'authorizedParties: parties,');
  return { config, http: source, clients: helper.clients };
}
async function prepare() {
  const baseline = join(process.env.LOCALAPPDATA, 'Memoney/entry-edit-release-0fc1ded6/runtime');
  if (!existsSync(join(baseline, 'wrangler.json'))) throw Error('Verified deployed runtime required');
  const connection = JSON.parse(read(join(root, 'config/android-internal.json')));
  const config = JSON.parse(read(join(baseline, 'wrangler.json')));
  const response = await fetch(connection.apiOrigin + '/', { signal: AbortSignal.timeout(15000), cache: 'no-store' });
  if (!response.ok || hash(Buffer.from(await response.arrayBuffer())) !== hash(readFileSync(join(baseline, 'dist/index.html')))) throw Error('Live HTML no longer matches the frozen baseline; do not overwrite a newer deployment');
  const artifacts = internalAuthArtifacts(config, connection, JSON.parse(read(join(root, 'scripts/hosted-databases.json'))), {
    baselineHttp: read(join(baseline, 'server/auth/http.ts')), clients: read(join(root, 'server/auth/android-clients.ts')) });
  const parent = join(root, 'android/build'); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, 'internal-auth-runtime-'));
  for (const folder of ['dist', 'functions', 'server', 'node_modules/jose']) cpSync(join(baseline, folder), join(directory, folder), { recursive: true });
  writeFileSync(join(directory, 'wrangler.json'), JSON.stringify(artifacts.config, null, 2) + '\n', 'utf8');
  writeFileSync(join(directory, 'server/auth/http.ts'), artifacts.http, 'utf8');
  writeFileSync(join(directory, 'server/auth/android-clients.ts'), artifacts.clients, 'utf8');
  // Assert every pre-existing business handler and static asset remains byte-identical.
  for (const folder of ['dist', 'functions', 'server']) {
    for (const file of readdirSync(join(baseline, folder), { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())) {
      const parentPath = file.parentPath || file.path;
      const original = join(parentPath, file.name);
      const relative = original.slice(baseline.length + 1);
      if (relative.replaceAll('\\', '/') === 'server/auth/http.ts') continue;
      if (hash(readFileSync(original)) !== hash(readFileSync(join(directory, relative)))) throw Error('Unrelated runtime file changed: ' + relative);
    }
  }
  const receipt = { directory, baseline, origin: connection.apiOrigin, changed: ['server/auth/http.ts', 'server/auth/android-clients.ts', 'wrangler.json'],
    databaseIds: artifacts.config.d1_databases.map(db => db.database_id), databaseQueries: 0, databaseWrites: 0,
    deployed: false, firstOnboardingActivated: false, billingActivated: false };
  writeFileSync(join(parent, 'internal-auth-runtime.json'), JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(receipt));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepare();
