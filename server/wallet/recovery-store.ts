import { financeTables, scopedFinance } from './scoped-finance.ts';
import { hashToken } from '../auth/store.ts';

export const retention = 7 * 24 * 60 * 60 * 1000;
export type RecoveryState = { ledger_id: string; generation: string; status: string; expires_at: number | null };
export async function recoveryState(db: D1Database, ledgerId: string) {
  try {const current=await db.prepare('SELECT * FROM memoney_recovery_state WHERE ledger_id=?').bind(ledgerId).first<RecoveryState>();if(current)return current;}
  catch {/* First use initializes only additive recovery tables. */}
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS memoney_recovery_state (ledger_id TEXT PRIMARY KEY, generation TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', expires_at INTEGER)"),
    db.prepare("CREATE TABLE IF NOT EXISTS memoney_recoveries (id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, owner_user_id TEXT NOT NULL, kind TEXT NOT NULL, source_generation TEXT NOT NULL, snapshot_json TEXT, manifest_hash TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, restored_at INTEGER, purged_at INTEGER, result_json TEXT NOT NULL)"),
    db.prepare('CREATE TABLE IF NOT EXISTS memoney_recovery_guard (id INTEGER PRIMARY KEY CHECK(id=1), valid INTEGER NOT NULL CHECK(valid=1))'),
    db.prepare("INSERT OR IGNORE INTO memoney_recovery_state(ledger_id,generation) VALUES(?,'initial')").bind(ledgerId),
  ]);
  return (await db.prepare('SELECT * FROM memoney_recovery_state WHERE ledger_id=?').bind(ledgerId).first<RecoveryState>())!;
}
export function assertion(db: D1Database, condition: string, values: unknown[] = []) {
  // A failed CHECK aborts the entire D1 batch, including all financial writes.
  return db.prepare(`INSERT OR REPLACE INTO memoney_recovery_guard(id,valid) SELECT 1,CASE WHEN (${condition}) THEN 1 ELSE 0 END`).bind(...values);
}
export function generationDatabase(db: D1Database, ledgerId: string, generation: string): D1Database {
  const guard = () => assertion(db, "EXISTS(SELECT 1 FROM memoney_recovery_state WHERE ledger_id=? AND generation=? AND status='active')", [ledgerId,generation]);
  function wrap(statement: D1PreparedStatement): D1PreparedStatement {
    return {
      bind(...values) { return wrap(statement.bind(...values)); },
      first: () => statement.first(), all: () => statement.all(),
      async run() { return (await db.batch([guard(),statement]))[1]; },
    };
  }
  // Unwrap prepared statements for batch(): only the real D1 statements may cross its boundary.
  const statements = new WeakMap<object,D1PreparedStatement>();
  function prepare(sql: string) {
    const raw = db.prepare(sql);
    function bound(statement: D1PreparedStatement): D1PreparedStatement {
      const result = wrap(statement);
      result.bind = (...values) => bound(statement.bind(...values));
      statements.set(result,statement); return result;
    }
    return bound(raw);
  }
  return { prepare, async batch(items) { return (await db.batch([guard(),...items.map(item=>statements.get(item)||item)])).slice(1); } };
}
type Layout = {table: string; columns: string[]};
export async function snapshotLayout(db: D1Database): Promise<Layout[]> {
  return Promise.all(financeTables.map(async table => {
    const columns=(await db.prepare(`PRAGMA table_info(${table})`).all<{name:string}>()).results.map(row=>row.name);
    if(!columns.length || columns.some(column=>!/^\w+$/.test(column)))throw Error('RECOVERY_SCHEMA_UNSUPPORTED');
    return {table,columns};
  }));
}
export function snapshotExpression(layout: Layout[]) {
  const object=(columns:string[])=>'json_object('+columns.flatMap(column=>[`'${column}'`,`"${column}"`]).join(',')+')';
  // D1 permits 32 function arguments; transaction rows have more than 16 columns.
  const row=(columns:string[])=>columns.length<=16?object(columns):`json_set(${object(columns.slice(0,16))},${columns.slice(16).flatMap(c=>[`'$.${c}'`,`"${c}"`]).join(',')})`;
  return 'json_object('+layout.flatMap(({table,columns})=>[`'${table}'`,`json((SELECT json_group_array(json(row_json)) FROM (SELECT ${row(columns)} AS row_json FROM ${table} ORDER BY rowid)))`]).join(',')+')';
}
export async function capture(db: D1Database, layout: Layout[]) {
  const expression=snapshotExpression(layout);
  const row=await db.prepare(`SELECT ${expression} AS snapshot`).first<{snapshot:string}>();
  if(!row || new TextEncoder().encode(row.snapshot).length>1_500_000)throw Error('RECOVERY_TOO_LARGE');
  const data=JSON.parse(row.snapshot);
  if(layout.some(({table,columns})=>!Array.isArray(data[table])||data[table].some((r:Record<string,unknown>)=>Object.keys(r).length!==columns.length)))throw Error('RECOVERY_INVALID');
  return {json:row.snapshot, hash:await hashToken(row.snapshot), counts:Object.fromEntries(layout.map(({table})=>[table,data[table].length]))};
}
export function restoreStatements(db: D1Database, layout: Layout[], recoveryId: string) {
  return layout.map(({table,columns})=>db.prepare(`INSERT INTO ${table} (${columns.map(c=>`"${c}"`).join(',')}) SELECT ${columns.map(c=>`json_extract(value,'$.${c}')`).join(',')} FROM json_each((SELECT snapshot_json FROM memoney_recoveries WHERE id=?),'$.${table}')`).bind(recoveryId));
}
export async function purgeRecoveries(db: D1Database, shared: boolean, now=Date.now()) {
  // Retain audit metadata. An expired recovery is never made recoverable by a later visit.
  await db.prepare('UPDATE memoney_recoveries SET snapshot_json=NULL,purged_at=? WHERE expires_at<=? AND snapshot_json IS NOT NULL').bind(now,now).run();
  const states=(await db.prepare("SELECT * FROM memoney_recovery_state WHERE status='archived' AND expires_at<=? ORDER BY expires_at LIMIT 1").bind(now).all<RecoveryState>()).results;
  for(const state of states) {
    if(!shared)continue;
    const scoped=scopedFinance(db,state.ledger_id);
    try {await db.batch([
      assertion(db,"EXISTS(SELECT 1 FROM memoney_recovery_state WHERE ledger_id=? AND status='archived' AND expires_at<=?)",[state.ledger_id,now]),
      ...financeTables.map(table=>scoped.prepare(`DELETE FROM ${table}`)),
      db.prepare("UPDATE memoney_recovery_state SET status='expired' WHERE ledger_id=?").bind(state.ledger_id),
    ]);}catch(error){
      const latest=await db.prepare('SELECT status FROM memoney_recovery_state WHERE ledger_id=?').bind(state.ledger_id).first<{status:string}>();
      if(latest?.status==='archived')throw error;
      // A restore won the race; its active data must remain untouched.
    }
  }
}
