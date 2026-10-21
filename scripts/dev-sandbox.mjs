import { readFileSync, cpSync, mkdirSync, mkdtempSync, existsSync, statSync } from 'node:fs';
import { resolve, join, dirname, relative } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

export function validateSandbox(config) {
  const allowed = ['name', 'compatibility_date', 'pages_build_output_dir', 'd1_databases'];
  if (Object.keys(config).some((key) => !allowed.includes(key))) throw new Error('Unexpected sandbox binding/configuration');
  if (config.pages_build_output_dir !== 'dist') throw new Error('Unexpected output directory');
  if (config.d1_databases?.length !== 1) throw new Error('Exactly one local D1 binding is required');
  const db = config.d1_databases[0];
  if (db.remote !== false || db.database_id !== '00000000-0000-0000-0000-000000000000' || db.binding !== 'DB' || db.database_name !== 'memoney-sandbox-local') {
    throw new Error('Sandbox must use the local-only placeholder D1, never a real remote database');
  }
  if (Object.keys(db).some((key) => !['binding', 'database_name', 'database_id', 'remote'].includes(key))) throw new Error('Unexpected D1 option');
}

export function sandboxPaths() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const workspace = createHash('sha256').update(root).digest('hex').slice(0, 12);
  const base = join(process.env.LOCALAPPDATA || join(homedir(), '.local', 'share'), 'Memoney');
  return { root, state: join(base, 'sandbox', workspace), runtime: join(base, 'sandbox-runtimes', workspace) };
}

export function runWrangler(args, cwd) {
  // Launch npm through Node on Windows, never concatenate paths into cmd.exe.
  const cli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
  if (process.platform === 'win32' && !existsSync(cli)) throw new Error('Node installation does not contain npx-cli.js');
  const result = spawnSync(process.platform === 'win32' ? process.execPath : 'npx',
    [...(process.platform === 'win32' ? [cli] : []), '--yes', 'wrangler@4.148.0', ...args],
    { cwd, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`Sandbox command failed (${result.status ?? result.error?.code})`);
}

export function prepareSandbox() {
  const paths = sandboxPaths();
  validateSandbox(JSON.parse(readFileSync(join(paths.root, 'wrangler.sandbox.json'), 'utf8')));
  if (!existsSync(join(paths.root, 'dist', 'index.html'))) throw new Error('Run npm run build before starting the sandbox');
  // Generated runtime only. Production config, .dev.vars and local caches are never copied.
  mkdirSync(dirname(paths.runtime), { recursive: true });
  // A fresh generation avoids retaining removed handlers or middleware from an older build.
  paths.runtime = mkdtempSync(`${paths.runtime}-`);
  cpSync(join(paths.root, 'wrangler.sandbox.json'), join(paths.runtime, 'wrangler.json'));
  const publicFiles = new Set(execFileSync('git', ['ls-files', '-z', '--', 'public'], { cwd: paths.root, encoding: 'utf8' }).split('\0').filter(Boolean).map(file => file.slice('public/'.length)));
  cpSync(join(paths.root, 'dist'), join(paths.runtime, 'dist'), { recursive: true, filter(source) {
    const file = relative(join(paths.root, 'dist'), source).replaceAll('\\', '/');
    const original = join(paths.root, 'public', file);
    return !existsSync(original) || !statSync(original).isFile() || publicFiles.has(file);
  } });
  cpSync(join(paths.root, 'functions'), join(paths.runtime, 'functions'), { recursive: true });
  if (existsSync(join(paths.root, 'server'))) {
    cpSync(join(paths.root, 'server'), join(paths.runtime, 'server'), { recursive: true });
    cpSync(join(paths.root, 'node_modules/jose'), join(paths.runtime, 'node_modules/jose'), { recursive: true });
  }
  return paths;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.slice(2).some((arg) => arg !== '--check')) throw new Error('Only --check is accepted; remote/config overrides are forbidden');
    const { root, state } = sandboxPaths();
    const configFile = join(root, 'wrangler.sandbox.json');
    validateSandbox(JSON.parse(readFileSync(configFile, 'utf8')));
    console.log(`Local-only D1 sandbox validated. Port: 5184. State: ${state}`);
    if (!process.argv.includes('--check')) {
      const { runtime } = prepareSandbox();
      runWrangler(['pages', 'dev', 'dist', '--ip', '127.0.0.1', '--port', '5184', '--persist-to', state], runtime);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
