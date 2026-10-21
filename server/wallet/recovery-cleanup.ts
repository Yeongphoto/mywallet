import { purgeRecoveries } from './recovery-store.ts';
import type { AuthDatabase } from '../auth/store.ts';
export async function retireExpiredShared(finance:D1Database,auth:AuthDatabase,now=Date.now()) {
  const expired=(await finance.prepare("SELECT ledger_id FROM memoney_recovery_state WHERE status='expired' LIMIT 5").all<{ledger_id:string}>()).results;
  if(!expired.length)return;
  await auth.prepare('CREATE TABLE IF NOT EXISTS memoney_expired_ledgers (ledger_id TEXT PRIMARY KEY,owner_user_id TEXT NOT NULL,name TEXT NOT NULL,expired_at INTEGER NOT NULL)').run();
  for(const ledger of expired){await auth.batch([
    auth.prepare('INSERT OR IGNORE INTO memoney_expired_ledgers(ledger_id,owner_user_id,name,expired_at) SELECT l.id,l.owner_user_id,l.name,? FROM ledgers l JOIN created_shared_ledgers c ON c.ledger_id=l.id WHERE l.id=?').bind(now,ledger.ledger_id),
    // Finance is already irreversibly expired. Releasing this owner slot is retry-safe;
    // UUID, ownership and membership audit rows remain, but the ledger is not selectable.
    auth.prepare('DELETE FROM created_shared_ledgers WHERE ledger_id=? AND EXISTS(SELECT 1 FROM memoney_expired_ledgers WHERE ledger_id=?)').bind(ledger.ledger_id,ledger.ledger_id),
  ]);
    await finance.prepare("UPDATE memoney_recovery_state SET status='retired' WHERE ledger_id=? AND status='expired'").bind(ledger.ledger_id).run();
  }
}
export default {
  async scheduled(_event:unknown,env:{PERSONAL:D1Database;SHARED:D1Database;AUTH:AuthDatabase}) {
    for(const [db,shared] of [[env.PERSONAL,false],[env.SHARED,true]] as const) {
      // A fresh deployment may not have initialized recovery tables yet.
      const exists=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memoney_recoveries'").first();
      if(exists){await purgeRecoveries(db,shared);if(shared)await retireExpiredShared(db,env.AUTH);}
    }
  },
};
