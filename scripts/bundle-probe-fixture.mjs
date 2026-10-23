import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleAuth } from '../server/auth/http.ts';
import { onRequestGet } from '../functions/api/data.ts';

function adapter(sqlite) {
  return { prepare(sql) { return { values: [], bind(...values) { this.values = values; return this; },
    async first() { return sqlite.prepare(sql).get(...this.values) ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...this.values) }; },
    async run() { return { meta: { changes: sqlite.prepare(sql).run(...this.values).changes } }; },
    sql }; }, async batch(statements) {
      sqlite.exec('BEGIN'); try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    } };
}
export async function startBundleFixture() {
  const origin = 'http://127.0.0.1:5198', auth = new DatabaseSync(':memory:'), finance = new DatabaseSync(':memory:');
  auth.exec(readFileSync(new URL('./auth-foundation-schema.sql', import.meta.url), 'utf8'));
  finance.exec(readFileSync(new URL('./android-sandbox-schema.sql', import.meta.url), 'utf8'));
  const env = { DB: adapter(auth), AUTH_ENABLED: 'true', AUTH_LOCAL_DEV: 'true', AUTH_ORIGIN: origin,
    AUTH_GOOGLE_CLIENT_ID: 'probe.apps.googleusercontent.com' };
  const metrics = { requests: 0, financialReads: 0, financialWrites: 0, denied: 0, duplicateCookieNames: 0, financeRows: 0, routes: {} };
  const ledger = '22222222-2222-4222-8222-222222222222';
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
      const body = Buffer.concat(chunks), url = new URL(incoming.url, origin);
      const request = new Request(url, { method: incoming.method, headers: incoming.headers, ...(body.length ? { body } : {}) });
      metrics.requests++;
      const route = incoming.method + ' ' + url.pathname;
      metrics.routes[route] = (metrics.routes[route] || 0) + 1;
      const cookieNames = (request.headers.get('Cookie') || '').split(';').map(value => value.trim().split('=')[0]).filter(Boolean);
      if (new Set(cookieNames).size !== cookieNames.length) metrics.duplicateCookieNames++;
      let response;
      if (url.searchParams.has('redirect')) response = new Response(null, { status: 302, headers: { Location: 'https://example.invalid' } });
      else if (url.pathname.startsWith('/api/auth/')) {
        response = await handleAuth(request, env, url.pathname.slice('/api/auth/'.length), async token => {
          if (token !== 'isolated-probe-token') throw Error('Fixture only');
          return { issuer: 'https://accounts.google.com', subject: 'isolated-bundle-probe' };
        });
      } else {
        const session = await handleAuth(new Request(origin + '/api/auth/session', { headers: request.headers }), env, 'session');
        if (!session.ok) { metrics.denied++; response = session; }
        else if (request.headers.get('X-Memoney-Ledger') && request.headers.get('X-Memoney-Ledger') !== ledger) {
          metrics.denied++; response = Response.json({ error: 'LEDGER_ACCESS_DENIED' }, { status: 403 });
        } else if (url.pathname === '/api/wallet/context') response = Response.json({ user: (await session.json()).user,
          ledger: { id: ledger, kind: 'personal', role: 'owner' }, mode: 'shared-web' });
        else if (url.pathname === '/api/data' && incoming.method === 'GET') {
          metrics.financialReads++; response = await onRequestGet({ request, env: { DB: adapter(finance) } });
        } else {
          if (url.pathname === '/api/data' && incoming.method !== 'GET') metrics.financialWrites++;
          response = Response.json({ error: 'FIXTURE_READ_ONLY' }, { status: 405 });
        }
      }
      const headers = Object.fromEntries([...response.headers.entries()].filter(([key]) => key !== 'set-cookie'));
      const cookies = response.headers.getSetCookie();
      if (cookies.length) headers['Set-Cookie'] = cookies;
      const bytes = Buffer.from(await response.arrayBuffer());
      outgoing.writeHead(response.status, headers); outgoing.end(bytes);
    } catch { if (!outgoing.headersSent) outgoing.writeHead(500); outgoing.end('{"error":"FIXTURE_ERROR"}'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(5198, '127.0.0.1', resolve); });
  return { metrics, ledger, async close() {
    await new Promise(resolve => server.close(resolve));
    metrics.financeRows = finance.prepare('SELECT COUNT(*) n FROM transactions').get().n;
    auth.close(); finance.close();
  } };
}
