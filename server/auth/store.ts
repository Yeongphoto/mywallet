import type { GoogleIdentity } from './google.ts';

export interface AuthStatement {
  bind(...values: unknown[]): AuthStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface AuthDatabase {
  prepare(sql: string): AuthStatement;
  batch(statements: AuthStatement[]): Promise<unknown>;
}
const sessionLifetime = 60 * 60 * 24 * 7;
export function opaqueToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function hashToken(token: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function createChallenge(db: AuthDatabase, now = Date.now()) {
  const token = opaqueToken();
  const nonce = opaqueToken();
  await db.prepare('INSERT INTO auth_login_challenges (token_hash, nonce, expires_at) VALUES (?, ?, ?)')
    .bind(await hashToken(token), nonce, now + 300000).run();
  return { token, nonce };
}
export async function readChallenge(db: AuthDatabase, token: string, now = Date.now()) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return db.prepare('SELECT nonce FROM auth_login_challenges WHERE token_hash = ? AND expires_at > ?')
    .bind(await hashToken(token), now).first<{ nonce: string }>();
}
export async function consumeChallenge(db: AuthDatabase, token: string, nonce: string, now = Date.now()) {
  return db.prepare('DELETE FROM auth_login_challenges WHERE token_hash = ? AND nonce = ? AND expires_at > ? RETURNING nonce')
    .bind(await hashToken(token), nonce, now).first<{ nonce: string }>();
}
export async function resolveUser(db: AuthDatabase, identity: GoogleIdentity, now = Date.now()) {
  const candidate = crypto.randomUUID();
  // Atomic provisioning: concurrent first logins resolve the same issuer/subject.
  // No email lookup, legacy owner claim, or automatic ledger copy occurs here.
  await db.batch([
    db.prepare('INSERT INTO users (id, status, created_at) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM auth_identities WHERE issuer = ? AND subject = ?)')
      .bind(candidate, 'active', now, identity.issuer, identity.subject),
    db.prepare('INSERT OR IGNORE INTO auth_identities (issuer, subject, user_id, created_at) SELECT ?, ?, id, ? FROM users WHERE id = ?')
      .bind(identity.issuer, identity.subject, now, candidate),
  ]);
  const user = await db.prepare('SELECT u.id, u.status FROM users u JOIN auth_identities i ON i.user_id = u.id WHERE i.issuer = ? AND i.subject = ?')
    .bind(identity.issuer, identity.subject).first<{ id: string; status: string }>();
  if (!user || user.status !== 'active') throw new Error('ACCOUNT_UNAVAILABLE');
  return user.id;
}
export async function createSession(db: AuthDatabase, userId: string, now = Date.now(), personalOnboarding = false) {
  const token = opaqueToken();
  const hash = await hashToken(token);
  const session = db.prepare('INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(hash, userId, now, now + sessionLifetime * 1000);
  if (personalOnboarding) await db.batch([
    // Immutable first-login owner. Re-login, another device and ledger reset never reopen it.
    db.prepare('INSERT OR IGNORE INTO personal_onboarding_accounts(user_id,first_session_hash,first_login_at,expires_at) VALUES(?,?,?,?)')
      .bind(userId, hash, now, now + 300000),
    session,
  ]);
  else await session.run();
  return { token, maxAge: sessionLifetime };
}
export async function sessionUser(db: AuthDatabase, token: string, now = Date.now()) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return db.prepare("SELECT u.id FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'")
    .bind(await hashToken(token), now).first<{ id: string }>();
}
export async function revokeSession(db: AuthDatabase, token: string) {
  if (/^[a-f0-9]{64}$/.test(token)) {
    await db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(await hashToken(token)).run();
  }
}
