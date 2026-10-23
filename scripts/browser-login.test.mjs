import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {generateKeyPair,SignJWT,exportJWK,createLocalJWKSet} from 'jose';
import {handleAuth} from '../server/auth/http.ts';
import {verifyGoogleIdentity} from '../server/auth/google.ts';
const {privateKey,publicKey}=await generateKeyPair('RS256'),keys=createLocalJWKSet({keys:[{...await exportJWK(publicKey),kid:'test',alg:'RS256'}]});
function fixture(origin='https://memoney-android-test.pages.dev'){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('auth-foundation-schema.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('ledger-invitations-schema.sql',import.meta.url),'utf8'));
 const db={prepare(sql){return {sql,values:[],bind(...values){this.values=values;return this;},async first(){return sqlite.prepare(sql).get(...this.values)||null;},async run(){return sqlite.prepare(sql).run(...this.values);}};},async batch(statements){sqlite.exec('BEGIN');try{const rows=statements.map(s=>sqlite.prepare(s.sql).run(...s.values));sqlite.exec('COMMIT');return rows;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const env={DB:db,AUTH_ENABLED:'true',AUTH_GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',AUTH_ORIGIN:origin,AUTH_BROWSER_LOGIN:'true'};
 const verify=(token,client,nonce,parties)=>verifyGoogleIdentity(token,client,nonce,keys,parties);
 const call=(action,body={},cookie='',origin=env.AUTH_ORIGIN)=>handleAuth(new Request(env.AUTH_ORIGIN+'/api/auth/'+action,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)}),env,action,verify);
 const start=async()=>{const r=await call('browser-start');assert.equal(r.status,200);const data=await r.json(),cookie=r.headers.get('Set-Cookie').split(';')[0];const approval=new URL(data.url).hash.slice('#approve='.length);return {...data,cookie,approval};};
 const sign=async(nonce,sub='google-subject')=>new SignJWT({nonce,email:'fixture@gmail.com',email_verified:true}).setProtectedHeader({alg:'RS256',kid:'test'}).setSubject(sub).setIssuer('https://accounts.google.com').setAudience(env.AUTH_GOOGLE_CLIENT_ID).setIssuedAt().setExpirationTime('5m').sign(privateKey);
 return {sqlite,env,call,start,sign,close(){sqlite.close();}};
}
for(const origin of ['https://memoney-android-test.pages.dev','https://memoney-6r5.pages.dev'])
test('external Google approval requires original-browser confirmation at '+origin,async()=>{const f=fixture(origin);try{
 const flow=await f.start(),preview=await (await f.call('browser-preview',{approval:flow.approval})).json();assert.equal(preview.code,flow.code);
 const approved=await f.call('browser-approve',{approval:flow.approval,code:flow.code,idToken:await f.sign(preview.nonce)});assert.equal(approved.status,200);assert.equal(approved.headers.get('Set-Cookie'),null);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n,0);
 const poll=await (await f.call('browser-poll',{},flow.cookie)).json();assert.equal(poll.email,'fixture@gmail.com');assert(poll.approved);
 assert.equal((await f.call('browser-claim',{code:flow.code,email:'wrong@gmail.com'},flow.cookie)).status,409);
 const claimed=await f.call('browser-claim',{code:flow.code,email:poll.email},flow.cookie);assert.equal(claimed.status,200);assert(claimed.headers.get('Set-Cookie').includes('HttpOnly; SameSite=Lax'));assert(claimed.headers.get('Set-Cookie').includes('Secure'));
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n,1);assert.equal((await f.call('browser-claim',{code:flow.code,email:poll.email},flow.cookie)).status,410);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM ledgers').get().n,0);
}finally{f.close();}});
test('approval link alone, another browser cookie, forged nonce, cross-origin requests and replays fail closed',async()=>{const f=fixture();try{
 const a=await f.start(),b=await f.start(),preview=await (await f.call('browser-preview',{approval:a.approval})).json();
 assert.equal((await f.call('browser-poll',{},'__Host-mywallet-browser-login='+a.approval)).status,410);
 assert.equal((await f.call('browser-claim',{code:a.code,email:'fixture@gmail.com'},b.cookie)).status,409);
 assert.equal((await f.call('browser-approve',{approval:a.approval,code:a.code,idToken:await f.sign('x'.repeat(64))})).status,401);
 assert.equal((await f.call('browser-approve',{approval:a.approval,code:a.code,idToken:await f.sign(preview.nonce)},'', 'https://evil.example')).status,403);
 assert.equal((await f.call('browser-approve',{approval:a.approval,code:a.code,idToken:await f.sign(preview.nonce)})).status,200);
 assert.equal((await f.call('browser-approve',{approval:a.approval,code:a.code,idToken:await f.sign(preview.nonce,'other')})).status,409);
 const row=f.sqlite.prepare('SELECT * FROM auth_browser_logins WHERE code=?').get(a.code);assert.notEqual(row.approval_hash,a.approval);assert(!JSON.stringify(row).includes(a.cookie.split('=')[1]));
 f.sqlite.prepare('UPDATE auth_browser_logins SET expires_at=0 WHERE code=?').run(a.code);assert.equal((await f.call('browser-poll',{},a.cookie)).status,410);
}finally{f.close();}});
test('browser flow is feature-gated, rate-limited, and leaves native Google login configuration intact',async()=>{const f=fixture();try{
 f.env.AUTH_BROWSER_LOGIN='false';assert.equal((await f.call('browser-start')).status,404);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='auth_browser_logins'").get().n,0);
 f.env.AUTH_BROWSER_LOGIN='true';for(let n=0;n<8;n++)assert.equal((await f.call('browser-start')).status,200);assert.equal((await f.call('browser-start')).status,429);
 assert.equal((await f.call('challenge')).status,200);
}finally{f.close();}});
