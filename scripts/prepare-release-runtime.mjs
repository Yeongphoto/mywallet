import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { releaseServerDraft } from './android-release-server.mjs';
import { assertDevelopmentConfig, readDevelopmentConfig } from './android-build-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export const dataRoute = "import { sharedWalletData } from '../../server/wallet/shared-web.ts';\n" +
  'export const onRequest = context => sharedWalletData(context.request, context.env);\n';
const middleware = "import { releaseGate } from '../server/release/gate.ts';\n" +
  'export const onRequest = context => releaseGate(context.request, context.env) || context.next();\n';

export function prepareReleaseRuntime({ sourceRoot = root, distribution = join(root, 'dist'), destination,
  profile, development, databases, personal, trackedPublic }) {
  const config = releaseServerDraft(profile, development, databases, personal);
  const identity = JSON.parse(readFileSync(join(distribution, 'memoney-build.json'), 'utf8'));
  if (identity.app !== 'memoney' || identity.mode !== 'production' || identity.authProbe !== false) {
    throw Error('A production web build without Android auth-probe mode is required');
  }
  if (!existsSync(join(distribution, 'index.html'))) throw Error('Built index.html is required');
  if (existsSync(destination) && readdirSync(destination).length) throw Error('Runtime output directory must be empty');
  mkdirSync(destination, { recursive: true });
  cpSync(distribution, join(destination, 'dist'), { recursive: true, filter(source) {
    const file = relative(distribution, source).replaceAll('\\', '/');
    const original = join(sourceRoot, 'public', file);
    return !existsSync(original) || !statSync(original).isFile() || trackedPublic.has(file);
  } });
  cpSync(join(sourceRoot, 'functions/api/auth'), join(destination, 'functions/api/auth'), { recursive: true });
  cpSync(join(sourceRoot, 'functions/api/wallet'), join(destination, 'functions/api/wallet'), { recursive: true });
  cpSync(join(sourceRoot, 'server'), join(destination, 'server'), { recursive: true });
  // Internal financial handlers receive only an already scoped { DB }. They must
  // never import the public /api/data route and recurse into authentication.
  cpSync(join(sourceRoot, 'functions/api/data.ts'), join(destination, 'server/wallet/legacy-data.ts'));
  const bridge = join(destination, 'server/wallet/shared-web.ts');
  const source = readFileSync(bridge, 'utf8');
  const originalImport = "../../functions/api/data.ts";
  if (!source.includes(originalImport)) throw Error('Financial handler import changed; review runtime generation');
  writeFileSync(bridge, source.replaceAll(originalImport, './legacy-data.ts'), 'utf8');
  cpSync(join(sourceRoot, 'node_modules/jose'), join(destination, 'node_modules/jose'), { recursive: true });
  writeFileSync(join(destination, 'functions/api/data.ts'), dataRoute, 'utf8');
  writeFileSync(join(destination, 'functions/_middleware.ts'), middleware, 'utf8');
  config.pages_build_output_dir = 'dist';
  writeFileSync(join(destination, 'wrangler.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');
  const readiness = { deployable: false, origin: profile.hosting.origin,
    authenticationEnabled: false, personalOnboardingEnabled: false,
    required: ['All origins: onboarding auth schema and coordinated issuance rollout',
      'Release Google Android OAuth and allowed Web origin', 'Operator/privacy/account-deletion policy',
      'Isolated-ledger app/web verification on the common DB before user traffic'],
    databaseIds: config.d1_databases.map(database => database.database_id) };
  writeFileSync(join(destination, 'RELEASE_READINESS.json'), JSON.stringify(readiness, null, 2) + '\n', 'utf8');
  return { directory: destination, readiness, config };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw Error('This command only prepares a release runtime; it never deploys');
  assertDevelopmentConfig(root);
  const json = file => JSON.parse(readFileSync(join(root, file), 'utf8'));
  const parent = join(root, 'android/build'); mkdirSync(parent, { recursive: true });
  const trackedPublic = new Set(execFileSync('git', ['ls-files', '-z', '--', 'public'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(Boolean).map(file => file.slice('public/'.length)));
  const result = prepareReleaseRuntime({ destination: mkdtempSync(join(parent, 'memoney-release-runtime-')),
    profile: json('config/android-release.json'), development: readDevelopmentConfig(root).capacitor,
    databases: json('scripts/hosted-databases.json'), personal: json('.android-tools/personal-test-wallet.json'), trackedPublic });
  console.log(JSON.stringify({ directory: result.directory, ...result.readiness, dbAccess: false, deployed: false }));
}
