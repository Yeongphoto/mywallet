import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const devId = 'com.mywallet.dev';
const devUrls = new Set(['https://memoney-android-test.pages.dev/signin', 'http://localhost:5187/signin']);
const oauthId = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

export function developmentConfigErrors({ capacitor, gradle, strings }) {
  const errors = [];
  const require = (ok, message) => { if (!ok) errors.push(message); };
  require(capacitor.appId === devId, 'Development appId must remain com.mywallet.dev');
  require(capacitor.appName === 'Memoney Dev', 'Development display name must remain Memoney Dev');
  require(devUrls.has(capacitor.server?.url), 'Development server must use the existing explicit test origin');
  require(capacitor.webDir === 'dist' && capacitor.loggingBehavior === 'none', 'Unexpected development webDir or logging');
  require(capacitor.server?.cleartext === false, 'Development cleartext must remain disabled');
  require(capacitor.android?.appendUserAgent === 'MemoneyAndroid', 'Development user-agent identity changed');
  const auth = capacitor.plugins?.MemoneyGoogleAuth;
  require(auth?.webClientId === '367615872651-ln2adrilfm9c9ofk12pl5jip1so1ra08.apps.googleusercontent.com', 'Development Web OAuth client changed');
  require(auth?.androidClientId === '367615872651-q007dfm9n7hf0q3jj62mepc50bhsoc4h.apps.googleusercontent.com', 'Development Android OAuth client changed');
  require(/applicationId\s+["']com\.mywallet\.dev["']/.test(gradle), 'Gradle development applicationId mismatch');
  require(/namespace\s*=\s*["']com\.mywallet\.dev["']/.test(gradle), 'Gradle namespace mismatch');
  for (const [key, value] of Object.entries({ app_name: 'Memoney Dev', title_activity_main: 'Memoney Dev', package_name: devId, custom_url_scheme: devId })) {
    require(strings.includes(`<string name="${key}">${value}</string>`), `Development resource mismatch: ${key}`);
  }
  return errors;
}

// This validates a preparation profile only. It cannot enable a release task,
// provision OAuth, change server bindings, or assert a security audit passed.
export function releaseConfigErrors(profile, development) {
  const errors = [];
  const require = (ok, message) => { if (!ok) errors.push(message); };
  require(profile.schemaVersion === 1, 'Unsupported release profile schema');
  require(profile.appId === 'com.memoney.app' && profile.appId !== development.appId, 'Release appId must be com.memoney.app and differ from development');
  require(profile.appName === 'Memoney' && profile.localizedAppName?.ko === '메머니', 'Release names must be Memoney / 메머니 (case-sensitive)');
  require(profile.webDir === 'dist' && profile.loggingBehavior === 'none', 'Unexpected release webDir or logging');
  require(profile.hosting?.project === 'memoney' && profile.hosting?.origin === 'https://memoney-6r5.pages.dev', 'Release must use the reserved memoney hosting project');
  require(profile.server?.url === `${profile.hosting?.origin}/signin` && !devUrls.has(profile.server?.url), 'Release must not use a development origin');
  require(profile.server?.cleartext === false && profile.server?.errorPath === 'android-unavailable.html', 'Release must retain HTTPS and the offline error page');
  const auth = profile.plugins?.MemoneyGoogleAuth;
  require(auth?.webClientId === development.plugins?.MemoneyGoogleAuth?.webClientId, 'Keep the common Web OAuth audience; do not replace it with an Android client');
  require(typeof auth?.androidClientId === 'string' && oauthId.test(auth.androidClientId) && auth.androidClientId !== development.plugins?.MemoneyGoogleAuth?.androidClientId,
    `${auth?.androidClientId == null ? 'Pending' : 'Invalid'}: release Android OAuth client (not the debug client)`);
  require(typeof profile.readiness?.playAppSigningSha1 === 'string' && /^(?:[A-Fa-f0-9]{2}:){19}[A-Fa-f0-9]{2}$/.test(profile.readiness.playAppSigningSha1), 'Pending: Play app signing SHA-1 (not upload/debug key)');
  for (const key of ['uploadKeyConfigured', 'serverDeploymentVerified', 'originMigrationVerified']) {
    require(profile.readiness?.[key] === true, `Pending: ${key}`);
  }
  return errors;
}

export function readDevelopmentConfig(directory = root) {
  return {
    capacitor: JSON.parse(readFileSync(resolve(directory, 'capacitor.config.json'), 'utf8')),
    gradle: readFileSync(resolve(directory, 'android/app/build.gradle'), 'utf8'),
    strings: readFileSync(resolve(directory, 'android/app/src/main/res/values/strings.xml'), 'utf8'),
  };
}

export function assertDevelopmentConfig(directory = root) {
  const errors = developmentConfigErrors(readDevelopmentConfig(directory));
  if (errors.length) throw new Error(errors.join('\n'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (!['development', 'release'].includes(mode) || process.argv.length !== 3) {
    console.error('Use: node scripts/android-build-config.mjs development|release');
    process.exitCode = 1;
  } else {
    const development = readDevelopmentConfig();
    const errors = developmentConfigErrors(development);
    if (mode === 'release') {
      const profile = JSON.parse(readFileSync(resolve(root, 'config/android-release.json'), 'utf8'));
      errors.push(...releaseConfigErrors(profile, development.capacitor));
    }
    for (const error of errors) console.error(error);
    if (errors.length) process.exitCode = 1;
    else console.log(`${mode}: configuration checks passed (no build, deployment, or data changes)`);
  }
}
