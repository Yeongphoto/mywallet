import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { assertDevelopmentConfig, readDevelopmentConfig, releaseConfigErrors } from './android-build-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(path, 'utf8');
const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

// Preparation is intentionally not an APK/AAB builder. Even a manually opened
// generated project cannot assemble/install a debug-signed production identity.
export function preparationArtifacts(profile, development) {
  const structuralErrors = releaseConfigErrors(profile, development).filter(error => !error.startsWith('Pending:'));
  if (structuralErrors.length) throw Error(structuralErrors.join('\n'));
  const capacitor = {
    appId: profile.appId, appName: profile.appName, webDir: 'dist', loggingBehavior: 'none',
    android: { appendUserAgent: development.android.appendUserAgent },
    plugins: { MemoneyApi: { ...profile.plugins.MemoneyApi }, MemoneyGoogleAuth: { webClientId: profile.plugins.MemoneyGoogleAuth.webClientId,
      ...(profile.plugins.MemoneyGoogleAuth.androidClientId ? { androidClientId: profile.plugins.MemoneyGoogleAuth.androidClientId } : {}) } },
    server: profile.server,
  };
  const strings = name => `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n` +
    Object.entries({ app_name: name, title_activity_main: name, package_name: profile.appId, custom_url_scheme: profile.appId })
      .map(([key, value]) => `    <string name="${key}">${xml(value)}</string>`).join('\n') + '\n</resources>\n';
  return {
    'capacitor.config.json': JSON.stringify(capacitor, null, 2) + '\n',
    'android/app/src/main/assets/capacitor.config.json': JSON.stringify(capacitor, null, 2) + '\n',
    'android/app/src/main/res/values/strings.xml': strings(profile.appName),
    'android/app/src/main/res/values-ko/strings.xml': strings(profile.localizedAppName.ko),
    'android/app/memoney-preparation.gradle': `// Generated preparation only; not a shipping build.\n` +
      `android.defaultConfig {\n    applicationId '${profile.appId}'\n    versionCode 1\n    versionName '0.1.0'\n}\n` +
      `gradle.taskGraph.whenReady { graph ->\n` +
      `    if (graph.allTasks.any { it.name ==~ /(?i)(assemble|bundle|install|publish).*/ || it.name ==~ /package(Debug|Release)/ }) {\n` +
      `        throw new GradleException('Preparation only: signing, OAuth, backend and origin migration are not approved for release.')\n    }\n}\n` +
      `tasks.register('memoneyProfileMetadata') {\n    doLast {\n` +
      `        println('MEMONEY_APP_ID=' + android.defaultConfig.applicationId)\n` +
      `        println('MEMONEY_NAMESPACE=' + android.namespace)\n` +
      `        println('MEMONEY_VERSION=' + android.defaultConfig.versionCode + ':' + android.defaultConfig.versionName)\n    }\n}\n`,
  };
}

const isFile = path => { try { return statSync(path).isFile(); } catch { return false; } };

export function signingConfigurationErrors(env, fileExists = isFile) {
  const errors = [];
  for (const name of ['MEMONEY_UPLOAD_KEYSTORE', 'MEMONEY_UPLOAD_KEY_ALIAS', 'MEMONEY_UPLOAD_STORE_PASSWORD', 'MEMONEY_UPLOAD_KEY_PASSWORD']) {
    if (typeof env[name] !== 'string' || !env[name].trim()) errors.push(`Missing: ${name}`);
  }
  if (env.MEMONEY_UPLOAD_KEYSTORE && (!fileExists(env.MEMONEY_UPLOAD_KEYSTORE) || /debug\.keystore$/i.test(env.MEMONEY_UPLOAD_KEYSTORE))) {
    errors.push('Upload keystore must exist and must not be the Android debug keystore');
  }
  if (/^androiddebugkey$/i.test(env.MEMONEY_UPLOAD_KEY_ALIAS ?? '')) errors.push('Upload alias must not be androiddebugkey');
  return errors;
}

export function prepareNativeProject() {
  assertDevelopmentConfig(root);
  const development = readDevelopmentConfig(root).capacitor;
  const profile = JSON.parse(read(join(root, 'config/android-release.json')));
  const artifacts = preparationArtifacts(profile, development);
  // Only tracked Android source is copied: no .wrangler, local.properties,
  // keystores, app data, cached web assets, PDFs, or other untracked files.
  const files = execFileSync('git', ['ls-files', '-z', '--', 'android'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const parent = join(root, 'android/build');
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, 'memoney-preparation-'));
  for (const file of files) {
    const target = join(directory, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(root, file), target);
  }
  // Capacitor generates these two library build files outside Git; copy only
  // these explicit files, never the entire ignored plugin/build directory.
  for (const name of ['build.gradle', 'cordova.variables.gradle']) {
    const file = `android/capacitor-cordova-android-plugins/${name}`;
    mkdirSync(dirname(join(directory, file)), { recursive: true });
    copyFileSync(join(root, file), join(directory, file));
  }
  for (const [file, content] of Object.entries(artifacts)) {
    mkdirSync(dirname(join(directory, file)), { recursive: true });
    writeFileSync(join(directory, file), content, { encoding: 'utf8' });
  }
  const appGradle = join(directory, 'android/app/build.gradle');
  writeFileSync(appGradle, read(appGradle) + "\napply from: 'memoney-preparation.gradle'\n", 'utf8');
  // Namespace is deliberately unchanged; use an explicit Activity class so
  // final applicationId can differ without moving native plugin Java packages.
  const manifest = join(directory, 'android/app/src/main/AndroidManifest.xml');
  writeFileSync(manifest, read(manifest).replace('android:name=".MainActivity"', 'android:name="com.mywallet.dev.MainActivity"'), 'utf8');
  symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  return directory;
}

function verify(directory) {
  const tools = join(root, '.android-tools/jdk21');
  const javaCandidates = [process.env.MYWALLET_JAVA_HOME, process.env.JAVA_HOME,
    ...(existsSync(tools) ? readdirSync(tools).map(name => join(tools, name)) : [])];
  const java = javaCandidates.find(path => path && existsSync(join(path, 'release')) && /JAVA_VERSION="21[.\"]/.test(read(join(path, 'release'))));
  if (!java) throw Error('JDK 21 is required for native preparation verification');
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(process.env.LOCALAPPDATA || '', 'Android/Sdk');
  const env = { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk };
  const cwd = join(directory, 'android');
  const gradle = task => spawnSync(process.platform === 'win32' ? 'cmd.exe' : './gradlew',
    process.platform === 'win32' ? ['/d', '/c', `gradlew.bat ${task} --console=plain`] : [task, '--console=plain'],
    { cwd, env, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const metadata = gradle('memoneyProfileMetadata');
  if (metadata.status !== 0 || !metadata.stdout.includes('MEMONEY_APP_ID=com.memoney.app')) {
    throw Error(`Native metadata verification failed\n${metadata.stdout}\n${metadata.stderr}`);
  }
  const merged = gradle('processDebugResources');
  if (merged.status !== 0) throw Error(`Native resources verification failed\n${merged.stdout}\n${merged.stderr}`);
  // Gradle/AGP emits a fully resolved manifest for the resource link task.
  const mergedManifest = join(directory, 'android/app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml');
  const manifest = read(mergedManifest);
  for (const expected of ['package="com.memoney.app"', 'com.memoney.app.fileprovider', 'com.mywallet.dev.MainActivity']) {
    if (!manifest.includes(expected)) throw Error(`Merged manifest mismatch: ${expected}`);
  }
  const resources = join(directory, 'android/app/build/intermediates/incremental/debug/packageDebugResources/merged.dir');
  for (const [qualifier, name] of [['values', 'Memoney'], ['values-ko', '메머니']]) {
    if (!read(join(resources, qualifier, `${qualifier}.xml`)).includes(`<string name="app_name">${name}</string>`)) {
      throw Error(`Merged resource mismatch: ${qualifier}`);
    }
  }
  for (const task of ['assembleDebug', 'bundleRelease']) {
    const blocked = gradle(task);
    if (blocked.status === 0 || !/Preparation only:|Release disabled:/.test(blocked.stdout + blocked.stderr)) {
      throw Error(`Expected preparation guard to block ${task}`);
    }
  }
  const outputs = join(directory, 'android/app/build/outputs');
  if (existsSync(outputs) && readdirSync(outputs, { recursive: true }).some(file => /\.(apk|aab)$/i.test(file))) {
    throw Error('Preparation must not produce an APK/AAB');
  }
  console.log('Native metadata, resources, merged manifest and debug/release build guards verified; no APK/AAB created');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (!['prepare', 'verify', 'signing-check'].includes(mode) || process.argv.length !== 3) throw Error('Use prepare, verify, or signing-check');
  if (mode === 'signing-check') {
    const errors = signingConfigurationErrors(process.env);
    for (const error of errors) console.error(error);
    if (errors.length) process.exitCode = 1;
    else console.log('Signing input present; certificate validity and key ownership still require verification. No secrets printed or signing performed.');
  } else {
    const directory = prepareNativeProject();
    console.log(`Preparation directory: ${directory}`);
    if (mode === 'verify') verify(directory);
  }
}
