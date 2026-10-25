import { handleAuth } from '../auth/http.ts';
import { accountBenefit } from './account-benefits.ts';
import type { MembershipEnvironment } from './membership.ts';

const reply = (data: unknown, status = 200) => Response.json(data, { status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
async function boundedBody(request: Request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json') || !request.body) throw Error('BAD_REQUEST');
  const reader=request.body.getReader(), chunks:Uint8Array[]=[]; let size=0;
  try { while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>4096){await reader.cancel();throw Error('BAD_REQUEST');}chunks.push(part.value);} }
  finally { reader.releaseLock(); }
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); } catch { throw Error('BAD_REQUEST'); }
}

export async function handleAccountManagement(request: Request, env: MembershipEnvironment) {
  if (!['GET','POST'].includes(request.method)) return reply({error:'METHOD_NOT_ALLOWED'},405);
  if (new URL(request.url).search) return reply({error:'BAD_REQUEST'},400);
  try {
    const session=await handleAuth(new Request(new URL('/api/auth/session',request.url),{headers:request.headers}),env,'session');
    if(!session.ok)return reply({error:session.status===401?'UNAUTHENTICATED':'ACCOUNT_MANAGEMENT_UNAVAILABLE'},session.status);
    const actor=(await session.json() as {user:{id:string}}).user.id;
    if(accountBenefit(actor)!=='premium_admin')return reply({error:'ADMIN_REQUIRED'},403);
    if(env.ACCOUNT_MANAGEMENT_ENABLED!=='true')return reply({error:'ACCOUNT_MANAGEMENT_NOT_CONFIGURED'},503);
    if(request.method==='GET') {
      const row=await env.DB.prepare(`SELECT json_group_array(json_object('userId',g.user_id,'email',p.email,'active',g.active,'updatedAt',g.updated_at)) AS rows
        FROM (SELECT * FROM account_premium_grants ORDER BY updated_at DESC LIMIT 1000) g
        LEFT JOIN auth_identity_profiles p ON p.user_id=g.user_id`).first<{rows:string}>();
      return reply({grants:JSON.parse(row?.rows||'[]')});
    }
    if(request.headers.get('Origin')!==env.AUTH_ORIGIN)return reply({error:'ORIGIN_REJECTED'},403);
    const body=await boundedBody(request);
    if(!body||typeof body!=='object'||Array.isArray(body))return reply({error:'BAD_REQUEST'},400);
    let target:string;
    if(body.action==='grant'&&Object.keys(body).sort().join(',')==='action,email'&&typeof body.email==='string'&&body.email.length<=254) {
      const email=body.email.trim().toLowerCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply({error:'INVALID_EMAIL'},400);
      const user=await env.DB.prepare(`SELECT MIN(p.user_id) AS user_id,COUNT(*) AS matches FROM auth_identity_profiles p JOIN users u ON u.id=p.user_id
        WHERE lower(p.email)=? AND p.authoritative=1 AND u.status='active'`).bind(email).first<{user_id:string|null;matches:number}>();
      if(!user?.user_id||user.matches===0)return reply({error:'ACCOUNT_NOT_FOUND'},404);
      if(user.matches!==1)return reply({error:'ACCOUNT_AMBIGUOUS'},409);
      target=user.user_id;
    } else if(body.action==='revoke'&&Object.keys(body).sort().join(',')==='action,userId'&&typeof body.userId==='string'&&uuid.test(body.userId)) {
      target=body.userId;
      const row=await env.DB.prepare('SELECT user_id FROM account_premium_grants WHERE user_id=?').bind(target).first();
      if(!row)return reply({error:'ACCOUNT_NOT_FOUND'},404);
    } else return reply({error:'BAD_REQUEST'},400);
    if(accountBenefit(target)==='premium_admin')return reply({error:'ADMIN_GRANT_PROTECTED'},409);
    const now=Date.now();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO account_premium_grants(user_id,active,granted_by,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET active=excluded.active,granted_by=excluded.granted_by,updated_at=excluded.updated_at`)
        .bind(target,body.action==='grant'?1:0,actor,now),
      env.DB.prepare('INSERT INTO account_premium_audit(id,actor_user_id,target_user_id,action,created_at) VALUES(?,?,?,?,?)')
        .bind(crypto.randomUUID(),actor,target,body.action,now),
    ]);
    return reply({ok:true});
  } catch(error) { return reply({error:(error as Error).message==='BAD_REQUEST'?'BAD_REQUEST':'ACCOUNT_MANAGEMENT_UNAVAILABLE'},(error as Error).message==='BAD_REQUEST'?400:503); }
}
