import { handleAuth } from '../auth/http.ts';
import type { AuthEnvironment } from '../auth/http.ts';
import { ledgerAccess } from '../auth/ledger-access.ts';
import { onRequestGet, onRequestPatch } from '../../functions/api/data.ts';
import { availableLedgers, isolatedSharedReady } from './shared-creation.ts';
import { scopedFinance } from './scoped-finance.ts';
import { generationDatabase, recoveryState } from './recovery-store.ts';
import { ensurePersonalLedger, personalFinance, personalOnboardingComplete } from './personal.ts';

export interface SharedWalletEnvironment extends AuthEnvironment {
  AUTH_SHARED_WALLET_ORIGIN?: string;
  AUTH_SHARED_WALLET_LEDGER_ID?: string;
  AUTH_SHARED_TEST_DEPLOYMENT?: string;
  AUTH_TEST_PERSONAL_LEDGER?: string;
  TEST_FINANCE?: D1Database;
  AUTH_TEST_MULTI_LEDGER?: string;
  TEST_SHARED_FINANCE?: D1Database;
  AUTH_LEDGER_RECOVERY?: string;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function reply(error: string, status: number) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store', 'Vary': 'Cookie' } });
}
export function sharedWalletConfiguration(env: SharedWalletEnvironment) {
  if(env.AUTH_PERSONAL_ONBOARDING==='true') {
    if(!env.TEST_FINANCE||!env.TEST_SHARED_FINANCE||env.AUTH_SHARED_WALLET_ORIGIN)return null;
    return {origin:'',ledgerId:env.AUTH_SHARED_WALLET_LEDGER_ID||''};
  }
  // Explicit test deployments only. Never enabled implicitly in the existing web deployment.
  const local = env.AUTH_LOCAL_DEV === 'true' && env.AUTH_ORIGIN === 'http://localhost:5187';
  const hosted = env.AUTH_SHARED_TEST_DEPLOYMENT === 'true' && env.AUTH_LOCAL_DEV !== 'true' &&
    env.AUTH_ORIGIN === 'https://memoney-android-test.pages.dev';
  if ((!local && !hosted) ||
      !uuid.test(env.AUTH_SHARED_WALLET_LEDGER_ID || '')) return null;
  if (env.AUTH_TEST_PERSONAL_LEDGER === 'true') {
    if (!hosted || !env.TEST_FINANCE || env.AUTH_SHARED_WALLET_ORIGIN) return null;
    return { origin: '', ledgerId: env.AUTH_SHARED_WALLET_LEDGER_ID! };
  }
  try {
    const origin = new URL(env.AUTH_SHARED_WALLET_ORIGIN || '');
    if (origin.protocol !== 'https:' || origin.origin !== env.AUTH_SHARED_WALLET_ORIGIN ||
        !(origin.hostname === 'mywallet-8mx.pages.dev' || origin.hostname.endsWith('.mywallet-8mx.pages.dev'))) return null;
    return { origin: origin.origin, ledgerId: env.AUTH_SHARED_WALLET_LEDGER_ID! };
  } catch { return null; }
}
export async function access(request: Request, env: SharedWalletEnvironment, write = false) {
  const sessionRequest = new Request(new URL('/api/auth/session', request.url), { headers: request.headers });
  const session = await handleAuth(sessionRequest, env, 'session');
  if (!session.ok) return { response: reply(session.status === 401 ? 'UNAUTHENTICATED' : 'AUTH_UNAVAILABLE', session.status) };
  const config = sharedWalletConfiguration(env);
  if (!config) return { response: reply('LEDGER_CONNECTION_PENDING', 503) };
  const data = await session.json() as { user: { id: string } };
  try {
    if(env.AUTH_PERSONAL_ONBOARDING==='true'){
      const personal=await ensurePersonalLedger(env,data.user.id);
      if(!await personalOnboardingComplete(env,personal))return {response:reply('PERSONAL_ONBOARDING_REQUIRED',425)};
      const selected=request.headers.get('X-Memoney-Ledger')||personal.id;
      const choices=await availableLedgers(env,data.user.id);
      const choice=choices.find(l=>l.id===selected);
      if(!choice||(write&&choice.role==='viewer'))return {response:reply('LEDGER_ACCESS_DENIED',403)};
      const ledger=await ledgerAccess(env.DB,data.user.id,choice.id,write?'write':'view');
      if(!ledger)return {response:reply('LEDGER_ACCESS_DENIED',403)};
      return {config,user:data.user,ledger:{...ledger,kind:choice.kind,name:choice.name},finance:choice.kind==='personal'?personalFinance(env,personal):scopedFinance(env.TEST_SHARED_FINANCE!,choice.id)};
    }
    if(env.AUTH_TEST_MULTI_LEDGER==='true') {
      if(!await isolatedSharedReady(env))return {response:reply('SHARING_NOT_CONFIGURED',503)};
      const ledgers=await availableLedgers(env,data.user.id);
      const selected=request.headers.get('X-Memoney-Ledger');
      const choice=selected?ledgers.find(ledger=>ledger.id===selected):ledgers[0];
      if(!choice||(write&&choice.role==='viewer'))return {response:reply('LEDGER_ACCESS_DENIED',403)};
      const ledger=await ledgerAccess(env.DB,data.user.id,choice.id,write?'write':'view');
      if(!ledger)return {response:reply('LEDGER_ACCESS_DENIED',403)};
      if(choice.kind==='personal') {
        const marker=await env.TEST_FINANCE!.prepare('SELECT ledger_id FROM memoney_test_database WHERE id=?').bind('memoney-android-test-personal').first<{ledger_id:string}>();
        if(marker?.ledger_id!==choice.id)return {response:reply('TEST_DATABASE_MISMATCH',503)};
      }
      return {config,user:data.user,ledger:{...ledger,kind:choice.kind,name:choice.name},finance:choice.kind==='personal'?env.TEST_FINANCE!:scopedFinance(env.TEST_SHARED_FINANCE!,choice.id)};
    }
    const ledger = await ledgerAccess(env.DB, data.user.id, config.ledgerId, write ? 'write' : 'view');
    if (!ledger) return { response: reply('LEDGER_ACCESS_DENIED', 403) };
    if (env.AUTH_TEST_PERSONAL_LEDGER === 'true') {
      if (ledger.role !== 'owner') return { response: reply('LEDGER_ACCESS_DENIED', 403) };
      const marker = await env.TEST_FINANCE!.prepare('SELECT ledger_id FROM memoney_test_database WHERE id=?')
        .bind('memoney-android-test-personal').first<{ ledger_id: string }>();
      if (marker?.ledger_id !== config.ledgerId) return { response: reply('TEST_DATABASE_MISMATCH', 503) };
    }
    return { config, user: data.user, ledger };
  } catch { return { response: reply('AUTH_UNAVAILABLE', 503) }; }
}

export async function sharedWalletContext(request: Request, env: SharedWalletEnvironment) {
  const result = await access(request, env);
  if (result.response) return result.response;
  const ledger = env.AUTH_PERSONAL_ONBOARDING==='true'||env.AUTH_TEST_MULTI_LEDGER === 'true' ? result.ledger : env.AUTH_TEST_PERSONAL_LEDGER === 'true'
    ? { ...result.ledger, kind: 'personal', name: '개인 장부' } : result.ledger;
  const recovery = env.AUTH_LEDGER_RECOVERY==='true' ? await recoveryState(result.finance||env.TEST_FINANCE!,result.ledger!.id) : null;
  return Response.json({ user: result.user, ledger: {...ledger,...(recovery?{generation:recovery.generation,recoveryStatus:recovery.status,recoveryExpiresAt:recovery.expires_at}:{})}, mode: 'shared-web' },
    { headers: { 'Cache-Control': 'no-store', 'Vary': 'Cookie' } });
}

export async function sharedWalletData(request: Request, env: SharedWalletEnvironment, upstream: typeof fetch = fetch) {
  if (!['GET', 'PATCH'].includes(request.method)) return reply('METHOD_NOT_ALLOWED', 405);
  if (request.method === 'PATCH' && request.headers.get('Origin') !== env.AUTH_ORIGIN) return reply('ORIGIN_REJECTED', 403);
  const result = await access(request, env, request.method === 'PATCH');
  if (result.response) return result.response;
  const source = new URL(request.url);
  const after = source.searchParams.get('after');
  if ([...source.searchParams.keys()].some(key => key !== 'after') ||
      (after !== null && (!/^\d+$/.test(after) || !Number.isSafeInteger(Number(after))))) return reply('INVALID_CURSOR', 400);
  if (env.AUTH_PERSONAL_ONBOARDING==='true'||env.AUTH_TEST_PERSONAL_LEDGER === 'true') {
    if (request.method === 'PATCH' && !request.headers.get('Content-Type')?.startsWith('application/json')) return reply('BAD_REQUEST', 400);
    // Run the existing revision/operation handler directly against the explicitly
    // bound test database. This branch never contacts the production web API.
    let db=result.finance||env.TEST_FINANCE!;
    const state=env.AUTH_LEDGER_RECOVERY==='true'?await recoveryState(db,result.ledger!.id):null;
    if(state) {
      if(state.status!=='active')return reply('LEDGER_ARCHIVED',423);
      const generation=request.headers.get('X-Memoney-Generation');
      if((request.method==='PATCH' || after!==null) && (generation||'initial')!==state.generation)return reply('LEDGER_GENERATION_CHANGED',409);
      db=generationDatabase(db,result.ledger!.id,state.generation);
    }
    const response = await (request.method === 'GET' ? onRequestGet : onRequestPatch)({ request, env: { DB: db } });
    if(state&&!response.ok) {
      const latest=await recoveryState(result.finance||env.TEST_FINANCE!,result.ledger!.id);
      if(latest.status!=='active')return reply('LEDGER_ARCHIVED',423);
      if(latest.generation!==state.generation)return reply('LEDGER_GENERATION_CHANGED',409);
    }
    return new Response(response.body, { status: response.status, headers: {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Cookie',
      'X-Content-Type-Options': 'nosniff',
      ...(state?{'X-Memoney-Generation':state.generation}:{}),
    } });
  }
  const url = new URL('/api/data', result.config!.origin);
  if (after !== null) url.searchParams.set('after', after);
  const headers = new Headers({ Accept: 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' });
  if (request.method === 'PATCH') {
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply('BAD_REQUEST', 400);
    headers.set('Content-Type', 'application/json');
    headers.set('Origin', result.config!.origin);
  }
  try {
    // The existing web API keeps its revision, operation and sync semantics.
    // No Google token, session cookie, arbitrary URL or client ownership header is forwarded.
    const response = await upstream(url, { method: request.method, headers,
      body: request.method === 'PATCH' ? request.body : undefined,
      redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(20000) });
    if (response.status >= 300 && response.status < 400 || !response.headers.get('Content-Type')?.includes('application/json')) {
      await response.body?.cancel();
      return reply('WALLET_UPSTREAM_UNAVAILABLE', 502);
    }
    return new Response(response.body, { status: response.status, headers: {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Cookie',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch { return reply('WALLET_UPSTREAM_UNAVAILABLE', 502); }
}
