import type { SharedWalletEnvironment } from './shared-web.ts';
import { hashToken } from '../auth/store.ts';
import { schemaStatements } from './scoped-finance.ts';

export function webConfiguration(env: SharedWalletEnvironment) {
  if (env.AUTH_WEB_WALLETS !== 'true' || env.AUTH_ENABLED !== 'true' || !env.WEB_FINANCE || env.AUTH_SHARED_WALLET_ORIGIN || env.TEST_FINANCE || env.TEST_SHARED_FINANCE) return false;
  try {
    const origin = new URL(env.AUTH_ORIGIN || '');
    return origin.origin === env.AUTH_ORIGIN && (origin.protocol === 'https:' ||
      env.AUTH_LOCAL_DEV === 'true' && origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname));
  } catch { return false; }
}
export async function webReady(env: SharedWalletEnvironment) {
  if (!webConfiguration(env)) return false;
  return !!await env.WEB_FINANCE!.prepare('SELECT id FROM web_finance_environment WHERE id=?').bind('memoney-web-finance-v1').first();
}
export async function webPersonalLedger(env: SharedWalletEnvironment, userId: string) {
  if (!await webReady(env)) throw Error('WEB_FINANCE_NOT_CONFIGURED');
  const user = await env.DB.prepare("SELECT id FROM users WHERE id=? AND status='active'").bind(userId).first();
  if (!user) throw Error('UNAUTHENTICATED');
  // A stable server-derived UUID makes concurrent provisioning idempotent. It
  // never identifies or claims the legacy ledger and is not an authorization token.
  const hex = await hashToken(`memoney:personal:v1:${userId}`);
  const id = `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO ledgers(id,owner_user_id,name,created_at) VALUES(?,?,?,?)').bind(id,userId,'개인 장부',now),
    env.DB.prepare('INSERT OR IGNORE INTO web_personal_ledgers(user_id,ledger_id) VALUES(?,?)').bind(userId,id),
    env.DB.prepare("INSERT OR IGNORE INTO ledger_memberships(ledger_id,user_id,role,created_at) SELECT l.id,l.owner_user_id,'owner',? FROM ledgers l JOIN web_personal_ledgers p ON p.ledger_id=l.id WHERE p.user_id=? AND l.owner_user_id=?").bind(now,userId,userId),
  ]);
  const match = await env.DB.prepare("SELECT p.ledger_id AS id FROM web_personal_ledgers p JOIN ledgers l ON l.id=p.ledger_id JOIN ledger_memberships m ON m.ledger_id=l.id AND m.user_id=l.owner_user_id WHERE p.user_id=? AND l.owner_user_id=? AND m.role='owner'").bind(userId,userId).first<{id:string}>();
  if (match?.id !== id) throw Error('PERSONAL_LEDGER_MISMATCH');
  const finance = env.WEB_FINANCE!;
  if (!await finance.prepare('SELECT ledger_id FROM web_personal_ready WHERE ledger_id=?').bind(id).first()) {
    await finance.batch([...schemaStatements(finance,id), finance.prepare('INSERT OR IGNORE INTO web_personal_ready(ledger_id) VALUES(?)').bind(id)]);
  }
  return { id, name: '개인 장부', kind: 'personal', role: 'owner' };
}
