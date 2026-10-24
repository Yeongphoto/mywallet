import { cpSync, readFileSync, writeFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(path, 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const baseline = JSON.parse(read(join(root, 'android/build/internal-auth-runtime.json'))).directory;
const config = JSON.parse(read(join(baseline, 'wrangler.json')));
const expected = JSON.parse(read(join(root, 'config/android-internal.json')));
if (config.name !== 'memoney-android-test' || config.vars.AUTH_ORIGIN !== expected.apiOrigin || config.vars.AUTH_PERSONAL_ONBOARDING === 'true') throw Error('Unexpected deployed baseline');
for (const id of Object.values(expected.databaseIds)) if (!config.d1_databases.some(db => db.database_id === id)) throw Error('Common DB mismatch');
const remote = await fetch(expected.apiOrigin + '/', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
if (!remote.ok || hash(Buffer.from(await remote.arrayBuffer())) !== hash(readFileSync(join(baseline, 'dist/index.html')))) throw Error('Canonical HTML changed; review newer deployment');
const file = 'server/wallet/legacy-data.ts';
const original = read(join(baseline, file));
const before = 'asset.kind || null, 0, String(asset.memo)';
const after = 'asset.kind || null, openingTransaction ? 0 : Number(asset.amount), String(asset.memo)';
if (original.split(before).length !== 2) throw Error('Expected one reviewed asset.create binding');
if (!read(join(root, 'functions/api/data.ts')).includes(after)) throw Error('Source implementation must match runtime patch');
const directory = mkdtempSync(join(root, 'android/build/asset-opening-runtime-'));
for (const folder of ['dist', 'functions', 'server', 'node_modules/jose']) cpSync(join(baseline, folder), join(directory, folder), { recursive: true });
cpSync(join(baseline, 'wrangler.json'), join(directory, 'wrangler.json'));
writeFileSync(join(directory, file), original.replace(before, after), 'utf8');
for (const folder of ['dist', 'functions', 'server']) for (const entry of readdirSync(join(baseline, folder), { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())) {
  const old = join(entry.parentPath || entry.path, entry.name), key = relative(baseline, old);
  if (key.replaceAll('\\', '/') !== file && hash(readFileSync(old)) !== hash(readFileSync(join(directory, key)))) throw Error('Unexpected runtime change: ' + key);
}
const receipt = { directory, baseline, changed: [file], configPreserved: true, deployed: false, databaseQueries: 0, databaseWrites: 0 };
writeFileSync(join(root, 'android/build/asset-opening-runtime.json'), JSON.stringify(receipt, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(receipt));
