import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2];
if (!['build', 'run'].includes(mode) || process.argv.length !== 3) throw new Error('Use build or run only');
const config = JSON.parse(readFileSync(join(root, 'capacitor.config.json'), 'utf8'));
const hosted = config.server?.url === 'https://memoney-android-test.pages.dev/signin';
if (config.appId !== 'com.mywallet.dev' || (!hosted && config.server?.url !== 'http://localhost:5187/signin')) {
  throw new Error('Android test must use the explicit test origin and development app ID');
}
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
const javaCandidates = [process.env.MYWALLET_JAVA_HOME, process.env.JAVA_HOME];
const tools = join(root, '.android-tools', 'jdk21');
if (existsSync(tools)) javaCandidates.push(...readdirSync(tools).map(name => join(tools, name)));
javaCandidates.push('C:/Program Files/Android/Android Studio/jbr');
const javaHome = javaCandidates.find(path => {
  if (!path || !existsSync(join(path, 'release'))) return false;
  return /JAVA_VERSION="(?:21|22|23|24)[.\"]/.test(readFileSync(join(path, 'release'), 'utf8'));
});
function execute(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) throw new Error(`Command failed: ${command} (${result.status ?? result.error?.message})`);
}
if (mode === 'build') {
  if (!javaHome) throw new Error('Set MYWALLET_JAVA_HOME to JDK 21 (Gradle 8 does not run on JDK 25). See Docs/android-port-plan.md');
  if (!existsSync(sdk)) throw new Error('Android SDK not found');
  const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk };
  if (process.platform === 'win32') {
    // Fixed command text; no user values or paths interpolated into cmd.exe.
    execute('cmd.exe', ['/d', '/c', 'gradlew.bat assembleDebug --console=plain'], { cwd: join(root, 'android'), env });
  } else {
    execute('./gradlew', ['assembleDebug', '--console=plain'], { cwd: join(root, 'android'), env });
  }
} else {
  const response = await fetch(`${hosted ? 'https://memoney-android-test.pages.dev' : 'http://127.0.0.1:5187'}/api/android-development`, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  const marker = await response.json();
  if (!response.ok || marker.environment !== (hosted ? 'memoney-android-test' : 'mywallet-auth-local') || (!hosted && marker.port !== 5187)) {
    throw new Error('Start npm run auth:server first. Unexpected server on port 5187.');
  }
  const adb = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  const devices = spawnSync(adb, ['devices'], { encoding: 'utf8' });
  const serials = devices.stdout?.split(/\r?\n/).filter(line => /^emulator-\d+\s+device$/.test(line.trim())).map(line => line.split(/\s+/)[0]);
  if (devices.status !== 0 || serials?.length !== 1) throw new Error('Exactly one booted Android emulator is required; physical devices are not targeted');
  const serial = serials[0];
  if (!hosted) execute(adb, ['-s', serial, 'reverse', 'tcp:5187', 'tcp:5187']);
  execute(adb, ['-s', serial, 'install', '-r', join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')]);
  execute(adb, ['-s', serial, 'shell', 'am', 'start', '-n', 'com.mywallet.dev/.MainActivity']);
}
