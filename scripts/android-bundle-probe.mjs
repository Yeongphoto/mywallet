import { cpSync, copyFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { prepareNativeProject } from './android-release-prepare.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export function buildBundleProbe() {
  const directory = prepareNativeProject();
  const assets = join(directory, 'android/app/src/main/assets');
  const config = JSON.parse(readFileSync(join(directory, 'capacitor.config.json'), 'utf8'));
  config.appId = 'com.memoney.probe'; config.appName = 'Memoney Probe';
  config.server = { hostname: 'localhost', androidScheme: 'https' };
  config.plugins.MemoneyApi = { enabled: true, origin: 'http://127.0.0.1:5198', allowLocalProbe: true };
  for (const file of [join(directory, 'capacitor.config.json'), join(assets, 'capacitor.config.json')]) writeFileSync(file, JSON.stringify(config, null, 2) + '\n', 'utf8');
  writeFileSync(join(assets, 'capacitor.plugins.json'), '[]\n', 'utf8');
  for (const name of ['MemoneyApiPlugin.java', 'MemoneyPageTrust.java']) {
    const file = `android/app/src/main/java/com/mywallet/dev/${name}`;
    copyFileSync(join(root, file), join(directory, file));
  }
  const publicFiles = new Set(execFileSync('git', ['ls-files', '-z', '--', 'public'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean));
  cpSync(join(root, 'dist'), join(assets, 'public'), { recursive: true, filter(source) {
    const file = relative(join(root, 'dist'), source).replaceAll('\\', '/');
    const original = join(root, 'public', file);
    return !existsSync(original) || !statSync(original).isFile() || publicFiles.has('public/' + file);
  } });
  const manifest = join(directory, 'android/app/src/main/AndroidManifest.xml');
  writeFileSync(manifest, readFileSync(manifest, 'utf8').replace('android:allowBackup="true"', 'android:allowBackup="false"'), 'utf8');
  writeFileSync(join(directory, 'android/app/memoney-preparation.gradle'), `
android.defaultConfig { applicationId 'com.memoney.probe'; versionCode 1; versionName '0.1.0-probe' }
gradle.taskGraph.whenReady { graph ->
    if (graph.allTasks.any { it.name ==~ /(?i)(bundle(Debug|Release)|install.*|publish.*)/ }) {
        throw new GradleException('Probe only: no release, Gradle install or publishing')
    }
}
`, 'utf8');
  // Names/URI scheme in the probe must not impersonate the release app.
  for (const lang of ['values', 'values-ko']) {
    const file = join(directory, 'android/app/src/main/res', lang, 'strings.xml');
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll('com.memoney.app', 'com.memoney.probe')
      .replaceAll('>Memoney<', '>Memoney Probe<').replaceAll('>메머니<', '>메머니 검증<'), 'utf8');
  }
  const tools = join(root, '.android-tools/jdk21');
  const candidates = [process.env.MYWALLET_JAVA_HOME, ...(existsSync(tools) ? readdirSync(tools).map(name => join(tools, name)) : [])];
  const java = candidates.find(path => path && existsSync(join(path, 'release')) && /JAVA_VERSION="21[.\"]/.test(readFileSync(join(path, 'release'), 'utf8')));
  if (!java) throw Error('JDK 21 required');
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(process.env.LOCALAPPDATA || '', 'Android/Sdk');
  const result = spawnSync(process.platform === 'win32' ? 'cmd.exe' : './gradlew',
    process.platform === 'win32' ? ['/d', '/c', 'gradlew.bat assembleDebug --console=plain'] : ['assembleDebug', '--console=plain'],
    { cwd: join(directory, 'android'), env: { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk }, stdio: 'inherit' });
  if (result.status !== 0) throw Error('Probe APK build failed');
  const apk = join(directory, 'android/app/build/outputs/apk/debug/app-debug.apk');
  writeFileSync(join(root, 'android/build/memoney-bundle-probe.json'), JSON.stringify({ directory, apk, appId: 'com.memoney.probe', backend: 'http://127.0.0.1:5198' }, null, 2) + '\n', 'utf8');
  console.log(`Probe APK: ${apk}`);
  return { directory, apk };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw Error('This command only builds the isolated bundle probe');
  buildBundleProbe();
}
