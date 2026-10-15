import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { prepareSandbox, runWrangler, sandboxPaths } from './dev-sandbox.mjs';

if (process.argv.length > 2) throw new Error('Android sandbox accepts no config/remote overrides');
const paths = sandboxPaths();
// Different from the existing sandbox and .wrangler, including restored personal backups.
const state = join(dirname(dirname(paths.state)), 'android-sandbox', paths.state.split(/[\\/]/).at(-1));
const marker = join(state, 'initialized.json');
const existed = existsSync(state);
if (existed && !existsSync(marker)) {
  throw new Error('Unmarked Android sandbox exists. Inspect it; initialization will not overwrite it.');
}
const { runtime } = prepareSandbox();
mkdirSync(join(runtime, 'functions', 'api'), { recursive: true });
writeFileSync(join(runtime, 'functions', 'api', 'android-development.ts'),
  'export const onRequestGet = () => Response.json({ environment: "mywallet-android-local", port: 5186 });\n', 'utf8');
if (!existed) {
  mkdirSync(dirname(state), { recursive: true });
  mkdirSync(state, { recursive: false });
  runWrangler(['d1', 'execute', 'memoney-sandbox-local', '--local', '--persist-to', state,
    '--file', join(paths.root, 'scripts', 'android-sandbox-schema.sql')], runtime);
  writeFileSync(marker, JSON.stringify({ environment: 'mywallet-android-local', createdAt: new Date().toISOString() }) + '\n', 'utf8');
}
console.log(`Android local D1 only. Port 5186. State: ${state}`);
runWrangler(['pages', 'dev', 'dist', '--ip', '127.0.0.1', '--port', '5186', '--persist-to', state], runtime);
