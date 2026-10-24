import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { releaseGate } from '../server/release/gate.ts';
import { prepareReleaseRuntime, dataRoute } from './prepare-release-runtime.mjs';
import { readDevelopmentConfig } from './android-build-config.mjs';

const origin = 'https://memoney-6r5.pages.dev';
const active = { AUTH_RELEASE_DEPLOYMENT: 'true', AUTH_ENABLED: 'true', AUTH_PERSONAL_ONBOARDING: 'true', AUTH_ORIGIN: origin };
test('every release API stays closed until the coordinated auth rollout and exact origin are configured', () => {
  for (const path of ['/api/data', '/api/auth/google', '/api/wallet/onboarding', '/api/wallet/recovery']) {
    for (const key of Object.keys(active)) {
      const env = { ...active }; delete env[key];
      const response = releaseGate(new Request(origin + path), env);
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
    assert.equal(releaseGate(new Request(origin + path), active), null);
    assert.equal(releaseGate(new Request('https://preview.example' + path), active).status, 503);
  }
  assert.equal(releaseGate(new Request(origin + '/guest'), {}), null);
});

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'memoney-release-check-'));
  t.after(() => {
    assert.equal(dirname(directory), resolve(tmpdir()));
    assert(basename(directory).startsWith('memoney-release-check-'));
    rmSync(directory, { recursive: true, force: true });
  });
  const put = (file, body) => { mkdirSync(dirname(join(directory, file)), { recursive: true }); writeFileSync(join(directory, file), body, 'utf8'); };
  put('public/keep.png', 'tracked-icon'); put('public/user.pdf', 'user-owned');
  put('dist/index.html', '<html></html>'); put('dist/keep.png', 'tracked-icon'); put('dist/user.pdf', 'user-owned');
  put('dist/memoney-build.json', JSON.stringify({ app: 'memoney', mode: 'production', authProbe: false }));
  put('functions/api/auth/[action].ts', 'export const onRequest=()=>{};');
  put('functions/api/wallet/context.ts', 'export const onRequestGet=()=>{};');
  put('functions/api/billing/[action].ts', 'export const onRequest=()=>{};');
  put('functions/api/data.ts', 'export const legacyFinancialHandler = true;');
  put('server/wallet/shared-web.ts', "import { legacyFinancialHandler } from '../../functions/api/data.ts';");
  put('server/release/gate.ts', 'export const releaseGate=()=>null;');
  put('node_modules/jose/package.json', '{"name":"jose"}');
  put('.wrangler/runtime.sqlite', 'never-copy');
  const profile = JSON.parse(readFileSync(new URL('../config/android-release.json', import.meta.url), 'utf8'));
  const databases = JSON.parse(readFileSync(new URL('./hosted-databases.json', import.meta.url), 'utf8'));
  const options = { sourceRoot: directory, distribution: join(directory, 'dist'), destination: join(directory, 'out'),
    profile, development: readDevelopmentConfig().capacitor, databases,
    personal: { databaseId: databases.personal.id, databaseName: databases.personal.name, ledgerId: '11111111-1111-4111-8111-111111111111' },
    trackedPublic: new Set(['keep.png']) };
  return { directory, options, put };
}

test('generated public data route is authenticated, legacy handler is internal, and draft activation stays disabled', t => {
  const { options } = fixture(t);
  const result = prepareReleaseRuntime(options), out = result.directory;
  assert.equal(readFileSync(join(out, 'functions/api/data.ts'), 'utf8'), dataRoute);
  assert.match(readFileSync(join(out, 'server/wallet/shared-web.ts'), 'utf8'), /from '\.\/legacy-data.ts'/);
  assert.match(readFileSync(join(out, 'server/wallet/legacy-data.ts'), 'utf8'), /legacyFinancialHandler/);
  assert.match(readFileSync(join(out, 'functions/_middleware.ts'), 'utf8'), /releaseGate/);
  assert(existsSync(join(out, 'functions/api/billing/[action].ts')));
  assert.equal(result.config.vars.AUTH_ENABLED, 'false');
  assert.equal(result.config.vars.AUTH_PERSONAL_ONBOARDING, 'false');
  assert.equal(result.readiness.deployable, false);
  assert.equal(result.config.d1_databases.length, 3);
  assert(existsSync(join(out, 'dist/keep.png')));
  assert(!existsSync(join(out, 'dist/user.pdf')));
  assert(!existsSync(join(out, '.wrangler')));
  assert(!existsSync(join(out, 'auth-initialization.sql')));
  assert.throws(() => prepareReleaseRuntime(options), /must be empty/);
});

test('probe builds and changed shared DB identities are rejected before writing the output directory', t => {
  const { options, put } = fixture(t);
  for (const identity of [{ app: 'memoney', mode: 'android-probe', authProbe: true },
    { app: 'memoney', mode: 'production', authProbe: true }]) {
    put('dist/memoney-build.json', JSON.stringify(identity));
    assert.throws(() => prepareReleaseRuntime(options), /production web build/);
    assert(!existsSync(options.destination));
  }
  put('dist/memoney-build.json', JSON.stringify({ app: 'memoney', mode: 'production', authProbe: false }));
  options.databases.shared.id = '11111111-1111-4111-8111-111111111111';
  assert.throws(() => prepareReleaseRuntime(options), /database mismatch/);
  assert(!existsSync(options.destination));
});
