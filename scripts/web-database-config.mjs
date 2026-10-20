import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export function validateWebDatabaseConfig(config, toml, androidBindings, databases) {
  const bindings = [...toml.matchAll(/\[\[d1_databases\]\]\s*binding = "([^"]+)"\s*database_name = "([^"]+)"\s*database_id = "([^"]+)"/g)]
    .map(([, binding, database_name, database_id]) => ({ binding, database_name, database_id }));
  assert.deepEqual(bindings, config.d1_databases, 'Web deployment configurations have different DB bindings');
  assert.deepEqual(bindings.map(db => db.binding).sort(), ['DB', 'TEST_FINANCE', 'TEST_SHARED_FINANCE']);
  assert.equal(new Set(bindings.map(db => db.database_id)).size, 3, 'Database roles must remain separate');
  const vars = Object.fromEntries([...(toml.split('[vars]')[1] || '').matchAll(/(\w+) = "([^"]+)"/g)].map(([, key, value]) => [key, value]));
  assert.deepEqual(vars, config.vars, 'Web deployment configurations have different auth settings');
  assert.equal(vars.AUTH_ENABLED, 'true');
  assert.equal(vars.AUTH_ANDROID_DATA_COMPAT, 'true');
  if (androidBindings || databases) {
    assert.ok(androidBindings && databases, 'Both live Android bindings and database inventory are required');
    for (const db of bindings) {
      assert.equal(androidBindings[db.binding]?.id, db.database_id, `Web/Android DB mismatch: ${db.binding}`);
      assert.ok(databases.some(actual => actual.uuid === db.database_id && actual.name === db.database_name), `Missing or renamed DB: ${db.binding}`);
    }
  }
  return config;
}

export function readWebDatabaseConfig() {
  const config = JSON.parse(readFileSync(new URL('../wrangler.android-data.json', import.meta.url), 'utf8'));
  return validateWebDatabaseConfig(config, readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8'));
}
