import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.slice(2).some((arg) => arg !== '--check')) throw new Error('Only --check is accepted; remote/config overrides are forbidden');
    const root = fileURLToPath(new URL('../', import.meta.url));
    const configFile = join(root, 'wrangler.sandbox.json');
    validateSandbox(JSON.parse(readFileSync(configFile, 'utf8')));
    const workspace = createHash('sha256').update(root).digest('hex').slice(0, 12);
    const state = join(process.env.LOCALAPPDATA || join(homedir(), '.local', 'share'), 'Memoney', 'sandbox', workspace);
    console.log(`Local-only D1 sandbox validated. Port: 5184. State: ${state}`);
    if (!process.argv.includes('--check')) {
      const run = (args) => {
        // Arguments here are fixed, not arbitrary CLI/user input.
        const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
        if (result.error || result.status !== 0) throw new Error(`Sandbox command failed (${result.status ?? result.error?.code})`);
      };
      const argument = (value) => process.platform === 'win32' ? `"${value}"` : value;
      run(['--yes', 'wrangler@4.148.0', 'pages', 'dev', 'dist', '--config', argument(configFile), '--port', '5184', '--persist-to', argument(state)]);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
