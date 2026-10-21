import { handleAuth } from '../auth/http.ts';
import { hashToken } from '../auth/store.ts';
import type { SharedWalletEnvironment } from './shared-web.ts';
import { financeTables, schemaStatements, scopedFinance } from './scoped-finance.ts';
import { recoveryState } from './recovery-store.ts';
import { personalSnapshotRows } from './personal-snapshot.ts';

type Personal = { id: string; name: string; kind: 'personal'; role: 'owner'; storage_kind: string };
type Completion = { ledger_id: string; user_id: string; outcome: string; payload_hash: string | null; completed_at: number };
const reply = (data: unknown, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store','Vary':'Cookie'}});
const clock = "CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)";

export async function ensurePersonalLedger(env: SharedWalletEnvironment, userId: string): Promise<Personal> {
  if (env.AUTH_PERSONAL_ONBOARDING !== 'true' || !env.TEST_FINANCE || env.AUTH_SHARED_WALLET_ORIGIN) throw Error('PERSONAL_NOT_CONFIGURED');
  let mapping = await env.DB.prepare('SELECT ledger_id,storage_kind FROM personal_ledgers WHERE user_id=?').bind(userId).first<{ledger_id:string;storage_kind:string}>();
  if (!mapping) {
    // Adopt ONLY the explicitly configured legacy owner. Never assign their rows to another account.
    const legacy = env.AUTH_SHARED_WALLET_LEDGER_ID && await env.DB.prepare('SELECT id FROM ledgers WHERE id=? AND owner_user_id=?')
      .bind(env.AUTH_SHARED_WALLET_LEDGER_ID,userId).first<{id:string}>();
    const id = legacy ? legacy.id : crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO ledgers(id,owner_user_id,name,created_at) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM personal_ledgers WHERE user_id=?) AND NOT EXISTS(SELECT 1 FROM ledgers WHERE id=?)')
        .bind(id,userId,'개인 장부',Date.now(),userId,id),
      env.DB.prepare('INSERT OR IGNORE INTO personal_ledgers(user_id,ledger_id,storage_kind) SELECT ?,id,? FROM ledgers WHERE id=? AND owner_user_id=?')
        .bind(userId,legacy?'legacy':'scoped',id,userId),
      env.DB.prepare("INSERT OR IGNORE INTO ledger_memberships(ledger_id,user_id,role,created_at) SELECT ledger_id,user_id,'owner',? FROM personal_ledgers WHERE user_id=?")
        .bind(Date.now(),userId),
    ]);
    mapping = await env.DB.prepare('SELECT ledger_id,storage_kind FROM personal_ledgers WHERE user_id=?').bind(userId).first();
  }
  if (!mapping || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(mapping.ledger_id)) throw Error('PERSONAL_UNAVAILABLE');
  const owner = await env.DB.prepare("SELECT l.id FROM ledgers l JOIN ledger_memberships m ON m.ledger_id=l.id WHERE l.id=? AND l.owner_user_id=? AND m.user_id=? AND m.role='owner'")
    .bind(mapping.ledger_id,userId,userId).first();
  if (!owner) throw Error('PERSONAL_ACCESS_DENIED');
  if (mapping.storage_kind === 'legacy') {
    const marker = await env.TEST_FINANCE.prepare('SELECT ledger_id FROM memoney_test_database WHERE id=?').bind('memoney-android-test-personal').first<{ledger_id:string}>();
    if (marker?.ledger_id !== mapping.ledger_id || mapping.ledger_id !== env.AUTH_SHARED_WALLET_LEDGER_ID) throw Error('PERSONAL_DATABASE_MISMATCH');
  } else {
    const table='s_'+mapping.ledger_id.replaceAll('-','')+'_transactions';
    if(!await env.TEST_FINANCE.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(table).first())
      await env.TEST_FINANCE.batch(schemaStatements(env.TEST_FINANCE,mapping.ledger_id));
  }
  return {id:mapping.ledger_id,name:'개인 장부',kind:'personal',role:'owner',storage_kind:mapping.storage_kind};
}
export function personalFinance(env: SharedWalletEnvironment, ledger: Personal) {
  return ledger.storage_kind === 'legacy' ? env.TEST_FINANCE! : scopedFinance(env.TEST_FINANCE!,ledger.id);
}
async function metadata(db: D1Database) {
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS memoney_personal_onboarding(ledger_id TEXT PRIMARY KEY,user_id TEXT NOT NULL UNIQUE,outcome TEXT NOT NULL,payload_hash TEXT,completed_at INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS memoney_onboarding_guard(id INTEGER PRIMARY KEY CHECK(id=1),valid INTEGER NOT NULL CHECK(valid=1))'),
  ]);
}
const completed = (db: D1Database, id: string) => db.prepare('SELECT * FROM memoney_personal_onboarding WHERE ledger_id=?').bind(id).first<Completion>();
export async function personalOnboardingComplete(env: SharedWalletEnvironment, ledger: Personal) {
  const db = personalFinance(env,ledger); await metadata(db);
  return !!await completed(db,ledger.id);
}
function hasData(id: string) {
  // Tombstones, settings, receipts, history and previous recovery generations count too.
  return '(' + financeTables.map(table=>`EXISTS(SELECT 1 FROM ${table})`).join(' OR ') +
    ` OR EXISTS(SELECT 1 FROM memoney_recovery_state WHERE ledger_id='${id}' AND (generation!='initial' OR status!='active')) OR EXISTS(SELECT 1 FROM memoney_recoveries WHERE ledger_id='${id}'))`;
}
async function firstLogin(request: Request, env: SharedWalletEnvironment, userId: string) {
  const name = env.AUTH_LOCAL_DEV === 'true' ? 'mywallet-dev-session' : '__Host-mywallet-session';
  const values=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));
  const token = values.length===1 ? values[0].slice(name.length+1) : '';
  const currentHash = await hashToken(token);
  const first = await env.DB.prepare('SELECT a.first_session_hash,a.expires_at,s.expires_at AS session_expires FROM personal_onboarding_accounts a LEFT JOIN auth_sessions s ON s.token_hash=a.first_session_hash AND s.user_id=a.user_id WHERE a.user_id=?')
    .bind(userId).first<{first_session_hash:string|null;expires_at:number;session_expires:number|null}>();
  const active=!!first?.first_session_hash && (first.session_expires||0)>Date.now() && first.expires_at>Date.now();
  return {eligible:active&&first!.first_session_hash===currentHash,waiting:active&&first!.first_session_hash!==currentHash,expiresAt:first?.expires_at||0};
}
export async function handlePersonalOnboarding(request: Request, env: SharedWalletEnvironment) {
  if (env.AUTH_PERSONAL_ONBOARDING !== 'true') return reply({error:'PERSONAL_ONBOARDING_DISABLED'},404);
  if (!['GET','POST'].includes(request.method)) return reply({error:'METHOD_NOT_ALLOWED'},405);
  if (request.method==='POST' && request.headers.get('Origin')!==env.AUTH_ORIGIN) return reply({error:'ORIGIN_REJECTED'},403);
  if (request.method==='POST' && !request.headers.get('Content-Type')?.startsWith('application/json')) return reply({error:'BAD_REQUEST'},400);
  try {
    const session=await handleAuth(new Request(new URL('/api/auth/session',request.url),{headers:request.headers}),env,'session');
    if(!session.ok)return session;
    const {user}=await session.json() as {user:{id:string}};
    const ledger=await ensurePersonalLedger(env,user.id);
    const selected=request.headers.get('X-Memoney-Ledger');
    if(selected&&selected!==ledger.id)return reply({error:'PERSONAL_LEDGER_REQUIRED'},403);
    const db=personalFinance(env,ledger);await metadata(db);await recoveryState(db,ledger.id);
    const finish=(row:Completion)=>reply({status:'complete',outcome:row.outcome,ledger:{id:ledger.id,kind:'personal'},completedAt:row.completed_at});
    let row=await completed(db,ledger.id);if(row)return finish(row);
    // Check and mark an already-used ledger atomically. No source is inspected or uploaded.
    await db.prepare(`INSERT OR IGNORE INTO memoney_personal_onboarding(ledger_id,user_id,outcome,completed_at) SELECT ?,?,'existing',${clock} WHERE ${hasData(ledger.id)}`)
      .bind(ledger.id,user.id).run();
    row=await completed(db,ledger.id);if(row)return finish(row);
    const first=await firstLogin(request,env,user.id);
    if(first.waiting)return reply({status:'waiting',retryAfterMs:1000,expiresAt:first.expiresAt,ledger:{id:ledger.id,kind:'personal'}},202);
    if(!first.eligible) {
      await db.prepare(`INSERT OR IGNORE INTO memoney_personal_onboarding(ledger_id,user_id,outcome,completed_at) VALUES(?,?,'skipped',${clock})`).bind(ledger.id,user.id).run();
      return finish((await completed(db,ledger.id))!);
    }
    if(request.method==='GET')return reply({status:'pending',expiresAt:first.expiresAt,ledger:{id:ledger.id,kind:'personal'}});
    const reader=request.body?.getReader();if(!reader)return reply({error:'BAD_REQUEST'},400);
    const chunks:Uint8Array[]=[];let size=0;
    try {while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1_500_000){await reader.cancel();return reply({error:'INITIAL_IMPORT_TOO_LARGE'},413);}chunks.push(part.value);}}
    finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return reply({error:'BAD_REQUEST'},400);}
    if(!body||Object.keys(body).some(k=>k!=='snapshot')||!('snapshot' in body))return reply({error:'BAD_REQUEST'},400);
    let rows;try{rows=body.snapshot===null?[]:personalSnapshotRows(body.snapshot);}catch{return reply({error:'INVALID_LOCAL_SNAPSHOT'},400);}
    const hash=await hashToken(JSON.stringify(rows));
    try {
      // One finance transaction: reserve outcome + every row. No partial import, upsert or chunk progress.
      await db.batch([
        db.prepare(`INSERT OR REPLACE INTO memoney_onboarding_guard(id,valid) SELECT 1,CASE WHEN NOT EXISTS(SELECT 1 FROM memoney_personal_onboarding WHERE ledger_id=?) AND NOT ${hasData(ledger.id)} AND ${clock}<? THEN 1 ELSE 0 END`).bind(ledger.id,first.expiresAt),
        ...rows.map(({table,columns,values})=>db.prepare(`INSERT INTO ${table}(${columns.join(',')}) SELECT ${columns.map((_,i)=>`json_extract(value,'$[${i}]')`).join(',')} FROM json_each(?)`).bind(JSON.stringify(values))),
        db.prepare(`INSERT INTO memoney_personal_onboarding(ledger_id,user_id,outcome,payload_hash,completed_at) VALUES(?,?,?,?,${clock})`)
          .bind(ledger.id,user.id,rows.length?'imported':'empty',hash),
      ]);
    } catch {
      row=await completed(db,ledger.id);if(row)return finish(row);
      // A concurrent normal write/expiry invalidates the whole batch. Retry re-evaluates the server.
      return reply({error:'INITIAL_IMPORT_RETRY'},409);
    }
    return finish((await completed(db,ledger.id))!);
  } catch {return reply({error:'PERSONAL_ONBOARDING_UNAVAILABLE'},503);}
}
