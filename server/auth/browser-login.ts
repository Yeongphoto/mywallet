import {createSession,hashToken,opaqueToken,resolveUser,revokeSession} from './store.ts';
import type {AuthDatabase} from './store.ts';
import type {GoogleIdentity} from './google.ts';

type Config={clientId:string;origin:string;local:boolean;sessionCookie:string};
type Row={token_hash:string;approval_hash:string;nonce:string;code:string;user_id:string|null;email:string|null;expires_at:number};
const reply=(data:unknown,status=200,cookies:string[]=[])=>{
  const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
  for(const value of cookies)headers.append('Set-Cookie',value);return new Response(JSON.stringify(data),{status,headers});
};
const cookie=(name:string,value:string,age:number,local:boolean)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${local?'':'; Secure'}`;
function cookieToken(request:Request,name:string) {
  const values=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));return values.length===1?values[0].slice(name.length+1):'';
}
async function boundedBody(request:Request) {
  if(!request.headers.get('Content-Type')?.startsWith('application/json')||!request.body)return null;
  const reader=request.body.getReader(),decoder=new TextDecoder();let bytes=0,text='';
  try {while(true){const part=await reader.read();if(part.done)return text+decoder.decode();bytes+=part.value.length;if(bytes>20000){await reader.cancel();return null;}text+=decoder.decode(part.value,{stream:true});}}
  finally{reader.releaseLock();}
}
export async function browserLogin(request:Request,db:AuthDatabase,config:Config,action:string,verify:(token:string,clientId:string,nonce:string,parties:readonly string[])=>Promise<GoogleIdentity>) {
  const name=config.local?'mywallet-dev-browser-login':'__Host-mywallet-browser-login';
  try {
    await db.prepare('CREATE TABLE IF NOT EXISTS auth_browser_logins (token_hash TEXT PRIMARY KEY,approval_hash TEXT NOT NULL UNIQUE,nonce TEXT NOT NULL,code TEXT NOT NULL,user_id TEXT REFERENCES users(id),email TEXT,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,ip_hash TEXT NOT NULL)').run();
    const now=Date.now();
    if(action==='browser-start') {
      const ip=await hashToken(request.headers.get('CF-Connecting-IP')||'local');
      const recent=await db.prepare('SELECT COUNT(*) AS n FROM auth_browser_logins WHERE ip_hash=? AND created_at>?').bind(ip,now-60000).first<{n:number}>();
      if((recent?.n||0)>=8)return reply({error:'RATE_LIMITED'},429);
      const token=opaqueToken(),approval=opaqueToken(),nonce=opaqueToken(),code=opaqueToken().slice(0,8).toUpperCase();
      await db.prepare('DELETE FROM auth_browser_logins WHERE expires_at<=? OR token_hash=?').bind(now,await hashToken(cookieToken(request,name))).run();
      await db.prepare('INSERT INTO auth_browser_logins(token_hash,approval_hash,nonce,code,expires_at,created_at,ip_hash) VALUES(?,?,?,?,?,?,?)').bind(await hashToken(token),await hashToken(approval),nonce,code,now+300000,now,ip).run();
      return reply({url:config.origin+'/browser-login#approve='+approval,code,expiresAt:now+300000},200,[cookie(name,token,300,config.local)]);
    }
    const text=await boundedBody(request);if(text===null)return reply({error:'BAD_REQUEST'},400);
    let body:Record<string,unknown>={};try {body=JSON.parse(text||'{}');}catch{return reply({error:'BAD_REQUEST'},400);}
    const external=action==='browser-preview'||action==='browser-approve';
    const token=external?body.approval:cookieToken(request,name);
    if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return reply({error:'LOGIN_CHALLENGE_EXPIRED'},410);
    const row=await db.prepare(`SELECT * FROM auth_browser_logins WHERE ${external?'approval_hash':'token_hash'}=? AND expires_at>?`).bind(await hashToken(token),now).first<Row>();
    if(!row)return reply({error:'LOGIN_CHALLENGE_EXPIRED'},410);
    if(action==='browser-preview')return reply({clientId:config.clientId,nonce:row.nonce,code:row.code,approved:!!row.user_id});
    if(action==='browser-approve') {
      if(row.user_id)return reply({error:'ALREADY_APPROVED'},409);
      if(typeof body.idToken!=='string'||body.idToken.length>16384||body.code!==row.code)return reply({error:'BAD_REQUEST'},400);
      let identity:GoogleIdentity;try {identity=await verify(body.idToken,config.clientId,row.nonce,[]);}catch{return reply({error:'INVALID_ID_TOKEN'},401);}
      if(!identity.email)return reply({error:'VERIFIED_EMAIL_REQUIRED'},401);
      const user=await resolveUser(db,identity);
      // Approval is immutable. The requesting browser must still explicitly confirm
      // the verified email before it can obtain a session (login-CSRF protection).
      const approved=await db.prepare('UPDATE auth_browser_logins SET user_id=?,email=? WHERE token_hash=? AND user_id IS NULL AND expires_at>? RETURNING user_id').bind(user,identity.email,row.token_hash,Date.now()).first();
      if(!approved)return reply({error:'ALREADY_APPROVED'},409);
      await db.prepare('INSERT INTO auth_identity_profiles(user_id,email,authoritative,verified_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,authoritative=excluded.authoritative,verified_at=excluded.verified_at').bind(user,identity.email.trim().toLowerCase(),identity.authoritativeEmail?1:0,Date.now()).run();
      return reply({approved:true});
    }
    if(action==='browser-poll')return reply({approved:!!row.user_id,email:row.email,code:row.code,expiresAt:row.expires_at});
    if(action==='browser-claim') {
      if(!row.user_id||body.code!==row.code||body.email!==row.email)return reply({error:'ACCOUNT_CONFIRMATION_REQUIRED'},409);
      const active=await db.prepare("SELECT id FROM users WHERE id=? AND status='active'").bind(row.user_id).first();
      if(!active)return reply({error:'ACCOUNT_UNAVAILABLE'},403);
      const consumed=await db.prepare('DELETE FROM auth_browser_logins WHERE token_hash=? AND user_id=? AND expires_at>? RETURNING user_id').bind(row.token_hash,row.user_id,Date.now()).first();
      if(!consumed)return reply({error:'LOGIN_CHALLENGE_EXPIRED'},410);
      await revokeSession(db,cookieToken(request,config.sessionCookie));const session=await createSession(db,row.user_id);
      return reply({user:{id:row.user_id}},200,[cookie(config.sessionCookie,session.token,session.maxAge,config.local),cookie(name,'',0,config.local)]);
    }
    return reply({error:'NOT_FOUND'},404);
  }catch{return reply({error:'AUTH_UNAVAILABLE'},503);}
}
