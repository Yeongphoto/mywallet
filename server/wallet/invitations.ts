import { handleAuth } from '../auth/http.ts';
import { ledgerAccess } from '../auth/ledger-access.ts';
import { hashToken, opaqueToken } from '../auth/store.ts';
import type { SharedWalletEnvironment } from './shared-web.ts';
import { sharedWalletConfiguration } from './shared-web.ts';
import { availableLedgers, personalLedger, isolatedSharedReady } from './shared-creation.ts';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const expiry = 7 * 86400000;
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Vary': 'Cookie' } });
const fail = (error: string, status: number) => reply({ error }, status);

// This test build manages only the explicitly configured existing shared ledger.
// Financial requests retain the existing bridge, membership, and revision behavior.
export async function handleSharing(request: Request, env: SharedWalletEnvironment, now = Date.now()) {
  if (env.AUTH_LEDGER_INVITES !== 'true' || !sharedWalletConfiguration(env) ||
      !uuid.test(env.AUTH_SHARED_WALLET_LEDGER_ID || '')) return fail('SHARING_NOT_CONFIGURED', 503);
  if (!['GET', 'POST'].includes(request.method)) return fail('METHOD_NOT_ALLOWED', 405);
  if (request.method === 'POST' && request.headers.get('Origin') !== env.AUTH_ORIGIN) return fail('ORIGIN_REJECTED', 403);
  const session = await handleAuth(new Request(new URL('/api/auth/session', request.url), { headers: request.headers }), env, 'session');
  if (!session.ok) return fail(session.status === 401 ? 'UNAUTHENTICATED' : 'AUTH_UNAVAILABLE', session.status);
  const { user } = await session.json() as { user: { id: string } };
  const db = env.DB; let ledgerId = env.AUTH_SHARED_WALLET_LEDGER_ID!;
  try {
    let scopedBody: Record<string,unknown> | null=null;
    const multi=env.AUTH_TEST_MULTI_LEDGER==='true';
    if(multi) {
      if(!await isolatedSharedReady(env))return fail('SHARING_NOT_CONFIGURED',503);
      if(request.method==='POST') {
        const text=await request.text();if(text.length>4096)return fail('BAD_REQUEST',400);
        try{scopedBody=JSON.parse(text);}catch{return fail('BAD_REQUEST',400);}
        if(!scopedBody||Array.isArray(scopedBody))return fail('BAD_REQUEST',400);
      }
      if(scopedBody?.action==='accept'||scopedBody?.action==='preview') {
        const token=typeof scopedBody.token==='string'?scopedBody.token:'';
        const byId=uuid.test(String(scopedBody.invitationId))&&scopedBody.token===undefined;
        if(!byId&&!/^[a-f0-9]{64}$/.test(token))return fail('INVITATION_UNAVAILABLE',404);
        const target=await db.prepare(`SELECT i.ledger_id FROM ledger_invitations i JOIN created_shared_ledgers c ON c.ledger_id=i.ledger_id WHERE ${byId?'i.id':'i.token_hash'}=? AND c.status='ready'`)
          .bind(byId?scopedBody.invitationId:await hashToken(token)).first<{ledger_id:string}>();
        if(!target)return fail('INVITATION_UNAVAILABLE',404);ledgerId=target.ledger_id;
      } else {
        const own=await db.prepare("SELECT ledger_id FROM created_shared_ledgers WHERE owner_user_id=? AND status='ready'").bind(user.id).first<{ledger_id:string}>();
        const choices=await availableLedgers(env,user.id);
        const requested=scopedBody?.ledgerId || request.headers.get('X-Memoney-Ledger');
        ledgerId=(requested&&choices.find(l=>l.id===requested&&l.kind==='shared')?.id)||own?.ledger_id||choices.find(l=>l.kind==='shared')?.id||'';
        if(request.method==='POST'&&requested&&requested!==ledgerId)return fail('LEDGER_ACCESS_DENIED',403);
      }
    }
    if (env.AUTH_TEST_PERSONAL_LEDGER === 'true' && !multi) {
      if (request.method !== 'GET') return fail('PERSONAL_LEDGER_NOT_SHARED', 409);
      const access = await ledgerAccess(db, user.id, ledgerId);
      const profile = await db.prepare('SELECT email FROM auth_identity_profiles WHERE user_id=?')
        .bind(user.id).first<{ email: string | null }>();
      return reply({ user: { id: user.id, email: profile?.email || null }, ledger: null,
        personalLedger: access?.role === 'owner' ? { id: ledgerId, name: '개인 장부' } : null,
        members: [], invitations: [], receivedInvitations: [] });
    }
    const profile = await db.prepare('SELECT email, authoritative, verified_at FROM auth_identity_profiles WHERE user_id=?')
      .bind(user.id).first<{ email: string | null; authoritative: number; verified_at: number }>();
    const access = await ledgerAccess(db, user.id, ledgerId);
    if (request.method === 'GET') {
      const ledger = access ? await db.prepare('SELECT id, name FROM ledgers WHERE id=?').bind(ledgerId).first() : null;
      // Deliberately avoid returning other accounts or invitation targets to non-owners.
      const members = access ? await db.prepare('SELECT json_group_array(json_object(\'id\',m.user_id,\'role\',m.role,\'email\',p.email)) AS rows FROM ledger_memberships m LEFT JOIN auth_identity_profiles p ON p.user_id=m.user_id WHERE m.ledger_id=?')
        .bind(ledgerId).first<{ rows: string }>() : null;
      const invitations = access?.role === 'owner' ? await db.prepare('SELECT json_group_array(json_object(\'id\',id,\'email\',target_email,\'role\',role,\'expiresAt\',expires_at,\'revokedAt\',revoked_at,\'acceptedAt\',accepted_at)) AS rows FROM ledger_invitations WHERE ledger_id=?')
        .bind(ledgerId).first<{ rows: string }>() : null;
      const received = multi && profile?.authoritative ? await db.prepare("SELECT json_group_array(json_object('id',i.id,'name',l.name,'role',i.role,'expiresAt',i.expires_at)) AS rows FROM ledger_invitations i JOIN ledgers l ON l.id=i.ledger_id JOIN created_shared_ledgers c ON c.ledger_id=l.id WHERE c.status='ready' AND i.target_email=? AND i.revoked_at IS NULL AND i.accepted_at IS NULL AND i.expires_at>? AND NOT EXISTS(SELECT 1 FROM ledger_memberships m WHERE m.ledger_id=i.ledger_id AND m.user_id=?)")
        .bind(profile.email,now,user.id).first<{rows:string}>() : profile?.authoritative && !access ? await db.prepare('SELECT json_group_array(json_object(\'id\',i.id,\'name\',l.name,\'role\',i.role,\'expiresAt\',i.expires_at)) AS rows FROM ledger_invitations i JOIN ledgers l ON l.id=i.ledger_id WHERE i.ledger_id=? AND i.target_email=? AND i.revoked_at IS NULL AND i.accepted_at IS NULL AND i.expires_at>?')
          .bind(ledgerId,profile.email,now).first<{ rows: string }>() : null;
      return reply({ user: { id: user.id, email: profile?.email || null }, ledger: ledger ? { ...ledger, role: access!.role } : null,
        ...(multi?{personalLedger:await personalLedger(env,user.id),ledgers:await availableLedgers(env,user.id)}:{}),
        members: JSON.parse(members?.rows || '[]'), invitations: JSON.parse(invitations?.rows || '[]'), receivedInvitations: JSON.parse(received?.rows || '[]') });
    }
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return fail('BAD_REQUEST', 400);
    // Bound the body before JSON parsing (including chunked requests).
    const reader = multi ? undefined : request.body?.getReader(); if (!reader && !scopedBody) return fail('BAD_REQUEST', 400);
    const chunks: Uint8Array[] = []; let length = 0;
    try { while (reader) { const part = await reader.read(); if (part.done) break;
      length += part.value.byteLength; if (length > 4096) { await reader.cancel(); return fail('BAD_REQUEST', 400); } chunks.push(part.value); }
    } finally { reader?.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let body: Record<string, unknown>; try { body = scopedBody || JSON.parse(new TextDecoder().decode(bytes)); } catch { return fail('BAD_REQUEST', 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('BAD_REQUEST', 400);
    if (body.action === 'create') {
      if (access?.role !== 'owner') return fail('LEDGER_ACCESS_DENIED', 403);
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (email.length > 254 || !/^[^\s@]+@gmail\.com$/.test(email) || !['editor', 'viewer'].includes(String(body.role))) return fail('INVALID_INVITATION', 400);
      if (email === profile?.email) return fail('ALREADY_MEMBER', 409);
      const recent = await db.prepare('SELECT COUNT(*) AS n FROM ledger_invitations WHERE created_by=? AND created_at>?')
        .bind(user.id, now - 3600000).first<{ n: number }>();
      if ((recent?.n || 0) >= 20) return fail('RATE_LIMITED', 429);
      const existing = await db.prepare('SELECT m.user_id FROM ledger_memberships m JOIN auth_identity_profiles p ON p.user_id=m.user_id WHERE m.ledger_id=? AND p.email=?')
        .bind(ledgerId, email).first(); if (existing) return fail('ALREADY_MEMBER', 409);
      const id = crypto.randomUUID(), token = opaqueToken();
      await db.batch([
        db.prepare('UPDATE ledger_invitations SET revoked_at=? WHERE ledger_id=? AND target_email=? AND accepted_at IS NULL AND revoked_at IS NULL')
          .bind(now, ledgerId, email),
        db.prepare('INSERT INTO ledger_invitations (id,ledger_id,created_by,target_email,role,token_hash,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?)')
          .bind(id, ledgerId, user.id, email, body.role, await hashToken(token), now, now + expiry),
      ]);
      return reply({ id, token, expiresAt: now + expiry, link: `${env.AUTH_ORIGIN}/sharing#invite=${token}` }, 201);
    }
    if (body.action === 'accept' || body.action === 'preview') {
      const token = typeof body.token === 'string' ? body.token : '';
      const byId = uuid.test(String(body.invitationId)) && body.token === undefined;
      if (!byId && !/^[a-f0-9]{64}$/.test(token)) return fail('INVITATION_UNAVAILABLE', 404);
      const invite = await db.prepare(`SELECT id,target_email,role,accepted_by,accepted_at,expires_at,revoked_at FROM ledger_invitations WHERE ${byId ? 'id' : 'token_hash'}=? AND ledger_id=?`)
        .bind(byId ? body.invitationId : await hashToken(token), ledgerId).first<{ id: string; target_email: string; role: string; accepted_by: string | null; accepted_at: number | null; expires_at: number; revoked_at: number | null }>();
      if (!invite || invite.revoked_at !== null || (invite.accepted_at === null && invite.expires_at <= now)) return fail('INVITATION_UNAVAILABLE', 404);
      if (invite.accepted_by === user.id && await ledgerAccess(db, user.id, ledgerId)) return reply({ accepted: true, ledgerId });
      if (invite.accepted_at !== null) return fail('INVITATION_UNAVAILABLE', 404);
      if (!profile?.authoritative || now - profile.verified_at > 600000 || profile.verified_at > now) return fail('REAUTHENTICATE', 401);
      if (profile.email !== invite.target_email) return fail('INVITATION_ACCOUNT_MISMATCH', 403);
      if (body.action === 'preview') { const ledger=await db.prepare('SELECT name FROM ledgers WHERE id=?').bind(ledgerId).first<{name:string}>();return reply({ ledger: { name: ledger?.name || '공유 장부', role: invite.role }, expiresAt: invite.expires_at }); }
      // Invitation consumption and membership creation are atomic, with target, expiry,
      // revocation and owner checks repeated in the write itself.
      await db.batch([
        db.prepare('UPDATE ledger_invitations SET accepted_by=?,accepted_at=? WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>? AND target_email=(SELECT email FROM auth_identity_profiles WHERE user_id=? AND authoritative=1 AND verified_at BETWEEN ? AND ?) AND EXISTS(SELECT 1 FROM ledger_memberships m JOIN ledgers l ON l.id=m.ledger_id WHERE m.ledger_id=ledger_invitations.ledger_id AND m.user_id=ledger_invitations.created_by AND m.role=\'owner\' AND l.owner_user_id=m.user_id)')
          .bind(user.id, now, invite.id, now, user.id, now - 600000, now),
        db.prepare('INSERT OR IGNORE INTO ledger_memberships (ledger_id,user_id,role,created_at) SELECT ledger_id,accepted_by,role,accepted_at FROM ledger_invitations WHERE id=? AND accepted_by=? AND accepted_at=?')
          .bind(invite.id, user.id, now),
      ]);
      if (!await ledgerAccess(db, user.id, ledgerId)) return fail('INVITATION_UNAVAILABLE', 409);
      return reply({ accepted: true, ledgerId });
    }
    if (body.action === 'revoke') {
      if (access?.role !== 'owner') return fail('LEDGER_ACCESS_DENIED', 403);
      if (!uuid.test(String(body.id))) return fail('BAD_REQUEST', 400);
      await db.prepare('UPDATE ledger_invitations SET revoked_at=? WHERE id=? AND ledger_id=? AND accepted_at IS NULL AND revoked_at IS NULL')
        .bind(now, body.id, ledgerId).run(); return reply({ success: true });
    }
    if (body.action === 'remove') {
      if (access?.role !== 'owner') return fail('LEDGER_ACCESS_DENIED', 403);
      if (!uuid.test(String(body.userId))) return fail('BAD_REQUEST', 400);
      if (body.userId === user.id) return fail('OWNER_CANNOT_LEAVE', 409);
      await db.prepare('DELETE FROM ledger_memberships WHERE ledger_id=? AND user_id=? AND role<>\'owner\'')
        .bind(ledgerId, body.userId).run(); return reply({ success: true });
    }
    return fail('BAD_REQUEST', 400);
  } catch { return fail('SHARING_UNAVAILABLE', 503); }
}
