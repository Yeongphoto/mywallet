import { handleAuth } from '../auth/http.ts';
import { ledgerAccess } from '../auth/ledger-access.ts';
import { hashToken } from '../auth/store.ts';
import type { SharedWalletEnvironment } from './shared-web.ts';
import { copyTables, scopedFinance, schemaStatements } from './scoped-finance.ts';
import { ensurePersonalLedger, personalFinance, personalOnboardingComplete } from './personal.ts';
import { hostedWalletDeployment } from './deployment.ts';

export type Creation = {ledger_id:string;owner_user_id:string;operation_id:string;request_hash:string;source:string;status:string};
type CopyRow = {table:string;values:Record<string,unknown>};
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie'}});
export async function isolatedSharedReady(env:SharedWalletEnvironment) {
  if(env.AUTH_TEST_MULTI_LEDGER!=='true'||(env.AUTH_PERSONAL_ONBOARDING!=='true'&&!hostedWalletDeployment(env))||
    env.AUTH_SHARED_TEST_DEPLOYMENT!=='true'||!env.TEST_SHARED_FINANCE||env.AUTH_SHARED_WALLET_ORIGIN) return false;
  return !!await env.TEST_SHARED_FINANCE.prepare('SELECT id FROM memoney_shared_test_database WHERE id=?').bind('memoney-android-test-shared').first();
}
export async function personalLedger(env:SharedWalletEnvironment,userId:string) {
  if(env.AUTH_PERSONAL_ONBOARDING==='true')return ensurePersonalLedger(env,userId);
  const access=await ledgerAccess(env.DB,userId,env.AUTH_SHARED_WALLET_LEDGER_ID!);
  return access?.role==='owner'?{id:access.id,name:'개인 장부',kind:'personal',role:'owner'}:null;
}
export async function availableLedgers(env:SharedWalletEnvironment,userId:string) {
  const personal=await personalLedger(env,userId);
  const rows=await env.DB.prepare("SELECT json_group_array(json_object('id',l.id,'name',l.name,'kind','shared','role',m.role)) AS rows FROM created_shared_ledgers c JOIN ledgers l ON l.id=c.ledger_id JOIN ledger_memberships m ON m.ledger_id=c.ledger_id WHERE m.user_id=? AND c.status='ready'")
    .bind(userId).first<{rows:string}>();
  return [...(personal?[personal]:[]),...JSON.parse(rows?.rows||'[]')];
}
async function progress(env:SharedWalletEnvironment,creation:Creation) {
  const job=await env.TEST_SHARED_FINANCE!.prepare('SELECT next_row,total_rows,status FROM shared_creation_jobs WHERE ledger_id=?').bind(creation.ledger_id)
    .first<{next_row:number;total_rows:number;status:string}>();
  return {id:creation.ledger_id,operationId:creation.operation_id,source:creation.source,status:creation.status,
    completed:job?.next_row||0,total:job?.total_rows||0,percent:creation.status==='ready'?100:job?.total_rows?Math.min(99,Math.floor(job.next_row/job.total_rows*100)):0};
}
export async function handleLedgers(request:Request,env:SharedWalletEnvironment) {
  if(!['GET','POST'].includes(request.method))return reply({error:'METHOD_NOT_ALLOWED'},405);
  if(request.method==='POST'&&request.headers.get('Origin')!==env.AUTH_ORIGIN)return reply({error:'ORIGIN_REJECTED'},403);
  try {
    if(!await isolatedSharedReady(env))return reply({error:'SHARING_NOT_CONFIGURED'},503);
    const session=await handleAuth(new Request(new URL('/api/auth/session',request.url),{headers:request.headers}),env,'session');
    if(!session.ok)return reply({error:'UNAUTHENTICATED'},session.status);
    const {user}=await session.json() as {user:{id:string}};
    if(env.AUTH_PERSONAL_ONBOARDING==='true'&&!await personalOnboardingComplete(env,await ensurePersonalLedger(env,user.id)))return reply({error:'PERSONAL_ONBOARDING_REQUIRED'},425);
    let creation=await env.DB.prepare('SELECT * FROM created_shared_ledgers WHERE owner_user_id=?').bind(user.id).first<Creation>();
    if(request.method==='GET')return reply({ledgers:await availableLedgers(env,user.id),creation:creation?await progress(env,creation):null});
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'BAD_REQUEST'},400);
    const text=await request.text();if(text.length>4096)return reply({error:'BAD_REQUEST'},400);
    const body=JSON.parse(text);
    if(body.action==='rename') {
      if(!creation||creation.ledger_id!==body.ledgerId)return reply({error:'LEDGER_ACCESS_DENIED'},403);
      const name=validName(body.name);if(!name)return reply({error:'INVALID_LEDGER_NAME'},400);
      await env.DB.prepare('UPDATE ledgers SET name=? WHERE id=? AND owner_user_id=?').bind(name,creation.ledger_id,user.id).run();
      return reply({success:true});
    }
    if(body.action==='create') {
      const name=validName(body.name);
      if(!name||!['personal','empty'].includes(body.source)||!/^[-a-f0-9]{36}$/i.test(body.operationId||''))return reply({error:'INVALID_CREATION'},400);
      if(body.source==='personal'&&!await personalLedger(env,user.id))return reply({error:'LEDGER_ACCESS_DENIED'},403);
      const hash=await hashToken(JSON.stringify({name,source:body.source}));
      if(creation&&(creation.operation_id!==body.operationId||creation.request_hash!==hash))return reply({error:'SHARED_LEDGER_LIMIT',ledgerId:creation.ledger_id},409);
      if(!creation) {
        const ledgerId=crypto.randomUUID(),now=Date.now();
        try {await env.DB.batch([
          env.DB.prepare('INSERT INTO ledgers(id,owner_user_id,name,created_at) VALUES(?,?,?,?)').bind(ledgerId,user.id,name,now),
          env.DB.prepare("INSERT INTO created_shared_ledgers(ledger_id,owner_user_id,operation_id,request_hash,source,status,created_at) VALUES(?,?,?,?,?,'copying',?)").bind(ledgerId,user.id,body.operationId,hash,body.source,now),
        ]);} catch {/* A concurrent creator may have reserved the single owner slot. */}
        creation=await env.DB.prepare('SELECT * FROM created_shared_ledgers WHERE owner_user_id=?').bind(user.id).first<Creation>();
        if(!creation)return reply({error:'CREATION_UNAVAILABLE'},503);
        if(creation.operation_id!==body.operationId||creation.request_hash!==hash)return reply({error:'SHARED_LEDGER_LIMIT',ledgerId:creation.ledger_id},409);
      }
    } else if(body.action!=='continue'||!creation||body.ledgerId!==creation.ledger_id)return reply({error:'BAD_REQUEST'},400);
    if(creation!.status==='ready')return reply({creation:await progress(env,creation!)});
    const db=env.TEST_SHARED_FINANCE!,ledgerId=creation!.ledger_id;
    let job=await db.prepare('SELECT snapshot_json,next_row,total_rows,status FROM shared_creation_jobs WHERE ledger_id=?').bind(ledgerId)
      .first<{snapshot_json:string;next_row:number;total_rows:number;status:string}>();
    if(!job) {
      let rows:CopyRow[]=[];
      if(creation!.source==='personal') {
        let source=env.TEST_FINANCE!;
        if(env.AUTH_PERSONAL_ONBOARDING==='true'){
          const personal=await ensurePersonalLedger(env,user.id);
          if(!await personalOnboardingComplete(env,personal))return reply({error:'PERSONAL_ONBOARDING_REQUIRED'},425);
          source=personalFinance(env,personal);
        } else {
          const marker=await env.TEST_FINANCE!.prepare('SELECT ledger_id FROM memoney_test_database WHERE id=?').bind('memoney-android-test-personal').first<{ledger_id:string}>();
          if(marker?.ledger_id!==env.AUTH_SHARED_WALLET_LEDGER_ID)return reply({error:'TEST_DATABASE_MISMATCH'},503);
          if(!await personalLedger(env,user.id))return reply({error:'LEDGER_ACCESS_DENIED'},403);
        }
        // All SELECTs run in one D1 batch transaction, freezing one source snapshot.
        const result=await source.batch(copyTables.map(table=>source.prepare(`SELECT * FROM ${table} ORDER BY rowid`)));
        rows=copyTables.flatMap((table,index)=>(result[index].results||[]).filter(row=>table!=='settings'||!['theme','styleTheme'].includes(String(row.key)))
          .map(row=>({table,values:table==='transactions'?{...row,last_operation_id:null}:row})));
      }
      const snapshot=JSON.stringify(rows);if(snapshot.length>8_000_000)return reply({error:'COPY_TOO_LARGE'},413);
      await db.batch([...schemaStatements(db,ledgerId),db.prepare("INSERT OR IGNORE INTO shared_creation_jobs(ledger_id,snapshot_json,total_rows,status) VALUES(?,?,?,'copying')").bind(ledgerId,snapshot,rows.length)]);
      return reply({creation:await progress(env,creation!)});
    }
    const rows=JSON.parse(job.snapshot_json) as CopyRow[],chunk=rows.slice(job.next_row,job.next_row+40), scoped=scopedFinance(db,ledgerId);
    const statements=chunk.map(row=>{
      if(!copyTables.includes(row.table as typeof copyTables[number]))throw Error('INVALID_COPY');
      const columns=Object.keys(row.values);if(columns.some(key=>!/^\w+$/.test(key)))throw Error('INVALID_COPY');
      return scoped.prepare(`INSERT OR IGNORE INTO ${row.table} (${columns.join(',')}) SELECT ${columns.map(()=>'?').join(',')} WHERE EXISTS(SELECT 1 FROM shared_creation_jobs WHERE ledger_id=? AND status='copying')`).bind(...Object.values(row.values),ledgerId);
    });
    const next=job.next_row+chunk.length;
    await db.batch([...statements,db.prepare('UPDATE shared_creation_jobs SET next_row=MAX(next_row,?),status=CASE WHEN ?>=total_rows THEN \'ready\' ELSE status END WHERE ledger_id=?').bind(next,next,ledgerId)]);
    if(next>=job.total_rows) {
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO ledger_memberships(ledger_id,user_id,role,created_at) VALUES(?,?,'owner',?)").bind(ledgerId,user.id,Date.now()),
        env.DB.prepare("UPDATE created_shared_ledgers SET status='ready' WHERE ledger_id=? AND owner_user_id=?").bind(ledgerId,user.id),
      ]);creation!.status='ready';
    }
    return reply({creation:await progress(env,creation!)});
  }catch{return reply({error:'CREATION_UNAVAILABLE'},503);}
}
function validName(value:unknown) {
  if(typeof value!=='string')return null;const name=value.trim(),length=Array.from(name).length;
  return length>=1&&length<=30&&!/[\u0000-\u001f\u007f]/.test(name)?name:null;
}
