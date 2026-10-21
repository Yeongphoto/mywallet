import type { SharedWalletEnvironment } from './shared-web.ts';
import { access } from './shared-web.ts';
import { hashToken } from '../auth/store.ts';
import { financeTables } from './scoped-finance.ts';
import { assertion, capture, recoveryState, retention, snapshotExpression, snapshotLayout, restoreStatements } from './recovery-store.ts';

const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie'}});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function handleRecovery(request:Request,env:SharedWalletEnvironment,now=Date.now()) {
  if(env.AUTH_LEDGER_RECOVERY!=='true'||env.AUTH_TEST_PERSONAL_LEDGER!=='true')return reply({error:'RECOVERY_NOT_CONFIGURED'},503);
  if(!['GET','POST'].includes(request.method))return reply({error:'METHOD_NOT_ALLOWED'},405);
  if(request.method==='POST'&&request.headers.get('Origin')!==env.AUTH_ORIGIN)return reply({error:'ORIGIN_REJECTED'},403);
  try {
    const result=await access(request,env);
    if(result.response)return result.response;
    if(result.ledger!.role!=='owner')return reply({error:'LEDGER_ACCESS_DENIED'},403);
    const db=result.finance||env.TEST_FINANCE!,id=result.ledger!.id,user=result.user!.id;
    const state=await recoveryState(db,id);
    const layout=await snapshotLayout(db);
    const snapshot=await capture(db,layout);
    if(request.method==='GET') {
      const records=(await db.prepare('SELECT id,kind,created_at,expires_at,restored_at,manifest_hash FROM memoney_recoveries WHERE ledger_id=? AND owner_user_id=? AND snapshot_json IS NOT NULL AND expires_at>? ORDER BY created_at DESC').bind(id,user,now).all()).results;
      return reply({state,generation:state.generation,version:snapshot.hash,counts:snapshot.counts,records,serverTime:now});
    }
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'BAD_REQUEST'},400);
    const text=await request.text();if(text.length>4096)return reply({error:'BAD_REQUEST'},400);
    const body=JSON.parse(text);
    if(!uuid.test(body.operationId||'')||!['reset','archive','restore'].includes(body.action))return reply({error:'BAD_REQUEST'},400);
    const kind='kind' in result.ledger! ? result.ledger.kind : 'personal';
    if(body.action==='reset'&&kind!=='personal'||body.action==='archive'&&kind!=='shared')return reply({error:'INVALID_RECOVERY_ACTION'},400);
    const previous=await db.prepare('SELECT ledger_id,owner_user_id,kind,result_json FROM memoney_recoveries WHERE id=?').bind(body.operationId).first<{ledger_id:string;owner_user_id:string;kind:string;result_json:string}>();
    if(previous) {
      const saved=JSON.parse(previous.result_json);
      if(previous.ledger_id!==id||previous.owner_user_id!==user||saved.action!==body.action||saved.recoveryId!==(body.recoveryId||null))return reply({error:'OPERATION_ID_REUSED'},409);
      return reply(saved);
    }
    // Require a recent Google sign-in for destructive actions, not just a week-long session.
    const cookie=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-mywallet-session='))?.slice('__Host-mywallet-session='.length)||'';
    const session=await env.DB.prepare('SELECT created_at FROM auth_sessions WHERE token_hash=? AND user_id=? AND expires_at>?').bind(await hashToken(cookie),user,now).first<{created_at:number}>();
    if(!session||now-session.created_at>15*60*1000)return reply({error:'REAUTH_REQUIRED'},409);
    if(body.generation!==state.generation||body.version!==snapshot.hash)return reply({error:'RECOVERY_CHANGED'},409);
    if(state.status==='expired'||body.action!=='restore'&&state.status!=='active')return reply({error:'LEDGER_ARCHIVED'},423);
    let target: {snapshot_json:string;manifest_hash:string;expires_at:number;restored_at:number|null}|null=null;
    if(body.action==='restore') {
      if(!uuid.test(body.recoveryId||''))return reply({error:'BAD_REQUEST'},400);
      target=await db.prepare('SELECT snapshot_json,manifest_hash,expires_at,restored_at FROM memoney_recoveries WHERE id=? AND ledger_id=? AND owner_user_id=?').bind(body.recoveryId,id,user).first();
      if(!target?.snapshot_json||target.expires_at<=now||target.restored_at)return reply({error:'RECOVERY_EXPIRED'},410);
      if(await hashToken(target.snapshot_json)!==target.manifest_hash)return reply({error:'RECOVERY_CORRUPTED'},409);
      const restored=JSON.parse(target.snapshot_json);
      if(layout.some(({table,columns})=>!Array.isArray(restored[table])||restored[table].some((row:Record<string,unknown>)=>Object.keys(row).length!==columns.length||columns.some(c=>!(c in row)))))return reply({error:'RECOVERY_SCHEMA_UNSUPPORTED'},409);
    }
    const generation=crypto.randomUUID(),expiresAt=now+retention;
    const response={success:true,action:body.action,recoveryId:body.recoveryId||null,archiveId:body.operationId,generation,expiresAt};
    const statements=[
      assertion(db,'EXISTS(SELECT 1 FROM memoney_recovery_state WHERE ledger_id=? AND generation=? AND status=?) AND '+snapshotExpression(layout)+'=?',[id,state.generation,state.status,snapshot.json]),
      db.prepare('INSERT INTO memoney_recoveries(id,ledger_id,owner_user_id,kind,source_generation,snapshot_json,manifest_hash,created_at,expires_at,result_json) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(body.operationId,id,user,body.action==='restore'?'before-restore':body.action,state.generation,snapshot.json,snapshot.hash,now,expiresAt,JSON.stringify(response)),
    ];
    if(target)statements.push(assertion(db,"EXISTS(SELECT 1 FROM memoney_recoveries WHERE id=? AND ledger_id=? AND owner_user_id=? AND restored_at IS NULL AND snapshot_json IS NOT NULL AND manifest_hash=? AND expires_at>MAX(?,CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)))",[body.recoveryId,id,user,target.manifest_hash,now]));
    if(body.action!=='archive') {
      statements.push(...financeTables.map(table=>db.prepare(`DELETE FROM ${table}`)));
      if(target)statements.push(...restoreStatements(db,layout,body.recoveryId));
      // Cursor continuity is not reused across generations. New clients read a full snapshot.
      statements.push(db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('updatedAt',?)").bind(String(now)));
    }
    if(target)statements.push(db.prepare('UPDATE memoney_recoveries SET restored_at=? WHERE id=?').bind(now,body.recoveryId));
    statements.push(db.prepare('UPDATE memoney_recovery_state SET generation=?,status=?,expires_at=? WHERE ledger_id=?').bind(generation,body.action==='archive'?'archived':'active',body.action==='archive'?expiresAt:null,id));
    try {await db.batch(statements);}catch{return reply({error:'RECOVERY_CHANGED_OR_UNAVAILABLE'},409);}
    return reply(response);
  }catch(error){return reply({error:error instanceof Error&&error.message==='RECOVERY_TOO_LARGE'?'RECOVERY_TOO_LARGE':'RECOVERY_UNAVAILABLE'},503);}
}
