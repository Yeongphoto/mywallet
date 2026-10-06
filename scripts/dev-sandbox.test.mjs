import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSandbox, sandboxPaths } from './dev-sandbox.mjs';
import { relative, isAbsolute } from 'node:path';

const fixture = () => JSON.parse(readFileSync(new URL('../wrangler.sandbox.json', import.meta.url), 'utf8'));
test('local configuration is accepted', () => assert.doesNotThrow(() => validateSandbox(fixture())));
test('remote D1, real DB IDs, extra bindings and environment overrides are rejected', () => {
  for (const mutate of [
    (c) => { c.d1_databases[0].remote = true; },
    (c) => { delete c.d1_databases[0].remote; },
    (c) => { c.d1_databases[0].database_id = '8dfd0da4-d04e-4f57-bc74-4cc567d2de0e'; },
    (c) => { c.env = { staging: {} }; },
    (c) => { c.services = [{ binding: 'REMOTE' }]; },
    (c) => { c.d1_databases.push({}); },
    (c) => { c.d1_databases[0].preview_database_id = 'production'; },
  ]) {
    const c = fixture();
    mutate(c);
    assert.throws(() => validateSandbox(c));
  }
});

test('sandbox persistence/runtime are outside the source workspace and distinct', () => {
  const { root, state, runtime } = sandboxPaths();
  for (const path of [state, runtime]) {
    const rel = relative(root, path);
    assert.ok(isAbsolute(rel) || rel.startsWith('..'));
    assert.ok(!path.includes('.wrangler'));
  }
  assert.notEqual(state, runtime);
});
