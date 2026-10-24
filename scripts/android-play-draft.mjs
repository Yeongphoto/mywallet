import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { prepareNativeProject } from './android-release-prepare.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const signing = join(homedir(), '.memoney', 'signing');
const keystore = join(signing, 'memoney-upload.p12');
const credential = join(signing, 'upload-password.dpapi');
const read = file => readFileSync(file, 'utf8');
function javaHome() {
  const parent = join(root, '.android-tools/jdk21');
  const candidates = [process.env.MYWALLET_JAVA_HOME, process.env.JAVA_HOME,
    ...(existsSync(parent) ? readdirSync(parent).map(name => join(parent, name)) : [])];
  const java = candidates.find(path => path && existsSync(join(path, 'release')) && /JAVA_VERSION="21[.\"]/.test(read(join(path, 'release'))));
  if (!java) throw Error('JDK 21 required');
  return java;
}
function powershell(script, env = process.env) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function password() {
  if (process.platform !== 'win32') throw Error('This key store uses Windows current-user DPAPI');
  if (!existsSync(credential) || !existsSync(keystore)) throw Error('Run key-create first');
  return powershell("Add-Type -AssemblyName System.Security; [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($env:MEMONEY_CREDENTIAL_PATH),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))",
    { ...process.env, MEMONEY_CREDENTIAL_PATH: credential });
}
export function draftGradle(versionCode) {
  if (!Number.isSafeInteger(versionCode) || versionCode < 1) throw Error('Positive unique versionCode required');
  return `// Console draft only. Not approved for tester rollout or production.\n` +
    `android {\n defaultConfig { applicationId 'com.memoney.app'; versionCode ${versionCode}; versionName '0.1.${versionCode}' }\n` +
    ` signingConfigs { playUpload { storeFile file(System.getenv('MEMONEY_UPLOAD_KEYSTORE')); storePassword System.getenv('MEMONEY_UPLOAD_PASSWORD'); keyAlias 'memoney-upload'; keyPassword System.getenv('MEMONEY_UPLOAD_PASSWORD') } }\n` +
    ` buildTypes { release { signingConfig signingConfigs.playUpload; debuggable false } }\n}\n` +
    `gradle.taskGraph.whenReady { graph ->\n` +
    ` if (graph.allTasks.any { it.project.path == ':app' && (it.name ==~ /(?i)(install|publish).*/ || it.name ==~ /(?i)(assemble|bundle).*Debug/) }) throw new GradleException('Play draft: no debug identity, installation or publishing')\n}\n`;
}
export function assertDraftBuild(identity, config, internal = false) {
  if (identity.app !== 'memoney' || identity.mode !== 'production' || identity.authProbe !== false) throw Error('Production assets required; probe builds cannot be uploaded');
  if (config.appId !== 'com.memoney.app' || config.server?.url || config.server?.hostname !== 'localhost' ||
      config.server?.androidScheme !== 'https' || config.plugins?.MemoneyApi?.origin !== (internal ? 'https://memoney-android-test.pages.dev' : 'https://memoney-6r5.pages.dev') ||
      (internal && config.plugins?.MemoneyApi?.hostedInternalTest !== true) ||
      (!internal && config.plugins?.MemoneyApi?.hostedInternalTest !== undefined) ||
      config.plugins?.MemoneyApi?.allowLocalProbe || config.plugins?.MemoneyBilling?.enabled !== false) throw Error('Unexpected Play draft configuration');
}
function createKey() {
  if (process.platform !== 'win32') throw Error('Windows DPAPI required');
  if (existsSync(keystore) || existsSync(credential)) throw Error('Existing signing material preserved; never regenerate an upload key');
  mkdirSync(signing, { recursive: true });
  const secret = randomBytes(36).toString('base64url');
  const env = { ...process.env, MEMONEY_UPLOAD_PASSWORD: secret, MEMONEY_CREDENTIAL_PATH: credential };
  // No passwords in CLI arguments, shell history, Git, or output.
  powershell("Add-Type -AssemblyName System.Security; [IO.File]::WriteAllBytes($env:MEMONEY_CREDENTIAL_PATH,[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($env:MEMONEY_UPLOAD_PASSWORD),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))", env);
  const java = javaHome();
  execFileSync(join(java, 'bin/keytool.exe'), ['-genkeypair', '-keystore', keystore, '-storetype', 'PKCS12', '-alias', 'memoney-upload',
    '-storepass:env', 'MEMONEY_UPLOAD_PASSWORD', '-keypass:env', 'MEMONEY_UPLOAD_PASSWORD', '-keyalg', 'RSA', '-keysize', '3072',
    '-validity', '10000', '-dname', 'CN=Memoney Upload, O=Memoney, C=KR'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  execFileSync(join(java, 'bin/keytool.exe'), ['-exportcert', '-rfc', '-keystore', keystore, '-alias', 'memoney-upload',
    '-storepass:env', 'MEMONEY_UPLOAD_PASSWORD', '-file', join(signing, 'upload-certificate.pem')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  console.log('Upload key created outside Git: ' + signing);
  console.log('Password protected for this Windows user using DPAPI. An independent recoverable backup is still required.');
}
function buildDraft(versionCode, internal = false) {
  const secret = password(), java = javaHome();
  const identity = JSON.parse(read(join(root, 'dist/memoney-build.json')));
  const directory = prepareNativeProject();
  const assets = join(directory, 'android/app/src/main/assets');
  const config = JSON.parse(read(join(assets, 'capacitor.config.json')));
  if (internal) {
    const connection = JSON.parse(read(join(root, 'config/android-internal.json')));
    const databases = JSON.parse(read(join(root, 'scripts/hosted-databases.json')));
    for (const role of ['auth', 'personal', 'shared']) if (connection.databaseIds[role] !== databases[role].id) throw Error('Common DB identity changed');
    if (connection.appId !== 'com.memoney.app' || connection.track !== 'internal' || connection.billingEnabled !== false ||
        !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(connection.androidClientId)) throw Error('Invalid internal profile');
    config.plugins.MemoneyApi = { enabled: true, origin: connection.apiOrigin, hostedInternalTest: true };
    config.plugins.MemoneyGoogleAuth.androidClientId = connection.androidClientId;
    for (const file of [join(directory, 'capacitor.config.json'), join(assets, 'capacitor.config.json')]) writeFileSync(file, JSON.stringify(config, null, 2) + '\n', 'utf8');
  }
  assertDraftBuild(identity, config, internal);
  const tracked = new Set(execFileSync('git', ['ls-files', '-z', '--', 'public'], { cwd: root, encoding: 'utf8' }).split('\0'));
  cpSync(join(root, 'dist'), join(assets, 'public'), { recursive: true, filter(source) {
    const file = relative(join(root, 'dist'), source).replaceAll('\\', '/');
    const original = join(root, 'public', file);
    return !existsSync(original) || !statSync(original).isFile() || tracked.has('public/' + file);
  } });
  writeFileSync(join(assets, 'capacitor.plugins.json'), '[]\n', 'utf8');
  const gradlePath = join(directory, 'android/app/build.gradle');
  const gradle = read(gradlePath);
  const guard = /gradle\.taskGraph\.whenReady \{ graph ->\r?\n    if \(graph\.allTasks\.any \{ it\.name\.toLowerCase\(\)\.contains\('release'\) \}\) \{\r?\n        throw new GradleException\('Release disabled: finish authentication, ownership isolation and production API configuration first\.'\)\r?\n    \}\r?\n\}/;
  if (!guard.test(gradle)) throw Error('Development release guard changed; review before drafting');
  // Only the generated copy is changed. Development and preparation gates remain intact.
  writeFileSync(gradlePath, gradle.replace(guard, '// Explicit signed Console draft build.'), 'utf8');
  writeFileSync(join(directory, 'android/app/memoney-preparation.gradle'), draftGradle(versionCode), 'utf8');
  const manifest = join(directory, 'android/app/src/main/AndroidManifest.xml');
  writeFileSync(manifest, read(manifest).replace('android:allowBackup="true"', 'android:allowBackup="false"'), 'utf8');
  const env = { ...process.env, JAVA_HOME: java,
    ANDROID_HOME: process.env.ANDROID_HOME || join(process.env.LOCALAPPDATA, 'Android/Sdk'),
    MEMONEY_UPLOAD_KEYSTORE: keystore, MEMONEY_UPLOAD_PASSWORD: secret };
  const result = spawnSync('cmd.exe', ['/d', '/c', 'gradlew.bat bundleRelease --console=plain'], { cwd: join(directory, 'android'), env, stdio: 'inherit' });
  if (result.status !== 0) throw Error('Signed Console draft build failed');
  const aab = join(directory, 'android/app/build/outputs/bundle/release/app-release.aab');
  const verification = execFileSync(join(java, 'bin/jarsigner.exe'), ['-verify', aab], { encoding: 'utf8' });
  if (!/jar verified/.test(verification)) throw Error('AAB signature verification failed');
  const receipt = { appId: config.appId, versionCode, aab, sha256: createHash('sha256').update(readFileSync(aab)).digest('hex'),
    purpose: internal ? 'internal-common-db-test' : 'console-upload-draft', rolloutReady: false, billingEnabled: false,
    apiOrigin: config.plugins.MemoneyApi.origin,
    pending: ['Play signing certificate and Android OAuth', 'Authenticated backend deployment and isolated real-device verification'],
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() };
  writeFileSync(join(root, 'android/build/memoney-play-draft.json'), JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(receipt));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'key-create' && process.argv.length === 3) createKey();
  else if (process.argv[2] === 'build-draft' && process.argv.length === 4) buildDraft(Number(process.argv[3]));
  else if (process.argv[2] === 'build-internal' && process.argv.length === 4) buildDraft(Number(process.argv[3]), true);
  else throw Error('Use key-create, build-draft <versionCode>, or build-internal <versionCode>');
}
