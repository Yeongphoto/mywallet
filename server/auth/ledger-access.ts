import type { AuthDatabase } from './store.ts';

export type LedgerRole = 'owner' | 'editor' | 'viewer';
export async function ledgerAccess(db: AuthDatabase, authenticatedUserId: string, ledgerId: string,
  permission: 'view' | 'write' | 'manage' = 'view'): Promise<{ id: string; role: LedgerRole } | null> {
  if (!authenticatedUserId || !ledgerId || !['view', 'write', 'manage'].includes(permission)) return null;
  const member = await db.prepare("SELECT l.id, m.role FROM ledgers l JOIN ledger_memberships m ON m.ledger_id = l.id JOIN users u ON u.id = m.user_id WHERE l.id = ? AND m.user_id = ? AND u.status = 'active' AND (m.role <> 'owner' OR l.owner_user_id = m.user_id)")
    .bind(ledgerId, authenticatedUserId).first<{ id: string; role: LedgerRole }>();
  if (!member || !['owner', 'editor', 'viewer'].includes(member.role)) return null;
  if (permission === 'write' && member.role === 'viewer') return null;
  if (permission === 'manage' && member.role !== 'owner') return null;
  return member;
}
