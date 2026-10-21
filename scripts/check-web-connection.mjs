import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readWebDatabaseConfig, validateWebDatabaseConfig } from './web-database-config.mjs';

// Read-only preflight. Never logs tokens, user profiles or financial rows.
try {
  if (process.argv.length > 2) throw Error('No target or credential overrides are accepted');
  const config = readWebDatabaseConfig();
  const credential = readFileSync(join(process.env.APPDATA, 'xdg.config/.wrangler/config/default.toml'), 'utf8');
  const token = credential.match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];
  if (!token) throw Error('Run wrangler whoami to check local Cloudflare authentication');
  const root = 'https://api.cloudflare.com/client/v4/accounts/090ff65afe732a3bcc7036cc7fc37b3d';
  async function get(path) {
    const response = await fetch(root + path, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(20000) });
    const value = await response.json();
    if (!response.ok || !value.success) throw Error('Cloudflare read failed; run wrangler whoami and retry');
    return value.result;
  }
  const [databases, web, android] = await Promise.all([get('/d1/database'), get('/pages/projects/mywallet'), get('/pages/projects/memoney-android-test')]);
  validateWebDatabaseConfig(config, readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8'), android.deployment_configs.production.d1_databases, databases);
  for (const db of config.d1_databases) {
    if (web.deployment_configs.production.d1_databases[db.binding]?.id !== db.database_id) throw Error('Production web binding differs: ' + db.binding);
  }
  console.log(JSON.stringify({ sameAuthoritativeDatabases: true, databases: config.d1_databases.map(db => ({ name: db.database_name, id: db.database_id })), webOrigin: config.vars.AUTH_ORIGIN, androidOrigin: android.deployment_configs.production.env_vars.AUTH_ORIGIN.value, legacyWebDatabasePresent: databases.some(db => db.name === 'mywallet-db') }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
