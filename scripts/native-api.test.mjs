import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativeApiFetch } from '../src/auth/native-api.ts';

function fixture(response = { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'private=secret' }, body: '{"ok":true}' }) {
  const calls = [], other = [];
  const bridge = { async configuration() { return { enabled: true }; }, async request(options) { calls.push(options); return response; } };
  return { calls, other, bridge, fetch: nativeApiFetch(bridge, async (...args) => { other.push(args); return new Response('asset'); }, 'https://localhost') };
}
test('local API fetch uses only relative path and strips cookie response headers', async () => {
  const f = fixture();
  const response = await f.fetch('/api/data?after=1', { headers: { 'X-Memoney-Ledger': 'ledger' } });
  assert.equal(response.headers.get('Set-Cookie'), null);
  assert.equal(f.calls[0].path, '/api/data?after=1');
  assert.equal(f.calls[0].headers['x-memoney-ledger'], 'ledger');
  assert.deepEqual(await response.json(), { ok: true });
});
test('UTF-8 JSON body and original Request method survive the bridge', async () => {
  const f = fixture();
  await f.fetch(new Request('https://localhost/api/data', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '한글 보존' }) }));
  assert.equal(f.calls[0].method, 'PATCH');
  assert.equal(JSON.parse(f.calls[0].body).title, '한글 보존');
});
test('foreign origin API requests and fragments fail without native/network request', async () => {
  const f = fixture();
  for (const url of ['https://evil.example/api/data', '//evil.example/api/data', '/api/data#secret']) await assert.rejects(f.fetch(url));
  assert.equal(f.calls.length + f.other.length, 0);
});
test('non API assets remain on normal bundled fetch path', async () => {
  const f = fixture(); await f.fetch('/images/logo.png');
  assert.equal(f.other.length, 1); assert.equal(f.calls.length, 0);
});
test('an aborted request is never sent or retried', async () => {
  const f = fixture(), controller = new AbortController(); controller.abort();
  await assert.rejects(f.fetch('/api/data', { signal: controller.signal }));
  assert.equal(f.calls.length, 0);
});
test('redirect and invalid response status fail closed', async () => {
  for (const status of [0, 199, 302, 600]) await assert.rejects(fixture({ status, headers: {}, body: '' }).fetch('/api/data'));
});
test('transport failure never triggers automatic write retry', async () => {
  const f = fixture(); f.bridge.request = async options => { f.calls.push(options); throw Error('network'); };
  await assert.rejects(f.fetch('/api/data', { method: 'PATCH', body: '{}' })); assert.equal(f.calls.length, 1);
});
test('credentials omit is rejected rather than silently sending native cookies', async () => {
  const f = fixture(); await assert.rejects(f.fetch('/api/data', { credentials: 'omit' })); assert.equal(f.calls.length, 0);
});
