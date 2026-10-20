import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readWebDatabaseConfig, validateWebDatabaseConfig } from './web-database-config.mjs';

const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const config = readWebDatabaseConfig();
const bindings = Object.fromEntries(config.d1_databases.map(db => [db.binding, { id: db.database_id }]));
const inventory = config.d1_databases.map(db => ({ name: db.database_name, uuid: db.database_id }));
test('default and explicit web deployments use the same three canonical databases', () => {
  validateWebDatabaseConfig(config, toml, bindings, inventory);
});
test('stale configuration, missing DBs and Android binding drift prevent deployment preparation', () => {
  const changed = structuredClone(config);
  changed.d1_databases[0].database_id = '00000000-0000-0000-0000-000000000000';
  assert.throws(() => validateWebDatabaseConfig(changed, toml));
  assert.throws(() => validateWebDatabaseConfig(config, toml, bindings, inventory.slice(1)));
  assert.throws(() => validateWebDatabaseConfig(config, toml, { ...bindings, DB: { id: 'different' } }, inventory));
});
