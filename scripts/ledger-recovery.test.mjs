import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createSession} from '../server/auth/store.ts';
import {handleRecovery} from '../server/wallet/recovery.ts';
import {sharedWalletData} from '../server/wallet/shared-web.ts';
import {handleLedgers} from '../server/wallet/shared-creation.ts';
import {assertion,capture,generationDatabase,purgeRecoveries,recoveryState,snapshotLayout,retention} from '../server/wallet/recovery-store.ts';
import {financeTables,scopedFinance} from '../server/wallet/scoped-finance.ts';
import {retireExpiredShared} from '../server/wallet/recovery-cleanup.ts';
import {sharedWalletContext} from '../server/wallet/shared-web.ts';
import {onRequestGet as webGet,onRequestPatch as webPatch,onRequestPost as webPost} from '../functions/api/data.ts';

function adapter(sqlite){return {prepare(sql){return {sql,values:[],bind(...v){this.values=v;return this;},async first(){return sqlite.prepare(sql).get(...this.values)||null;},async all(){return {results:sqlite.prepare(sql).all(...this.values)};},async run(){return {meta:{changes:sqlite.prepare(sql).run(...this.values).changes}};}};},
 async batch(statements){sqlite.exec('BEGIN');try{const r=statements.map(s=>{const q=sqlite.prepare(s.sql);return /^SELECT|^PRAGMA/i.test(s.sql)?{results:q.all(...s.values),meta:{changes:0}}:{meta:{changes:q.run(...s.values).changes}};});sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};}
async function fixture(){
 const auth=new DatabaseSync(':memory:'),personal=new DatabaseSync(':memory:'),shared=new DatabaseSync(':memory:');
 for(const f of ['auth-foundation-schema.sql','ledger-invitations-schema.sql','shared-creation-auth-schema.sql'])auth.exec(readFileSync(new URL(f,import.meta.url),'utf8'));
 personal.exec(readFileSync(new URL('android-sandbox-schema.sql',import.meta.url),'utf8'));shared.exec(readFileSync(new URL('shared-creation-finance-schema.sql',import.meta.url),'utf8'));
 const owner=randomUUID(),guest=randomUUID(),ledger=randomUUID(),now=Date.now(),db=adapter(auth),pdb=adapter(personal),sdb=adapter(shared),cookies={};
 for(const id of [owner,guest]){auth.prepare('INSERT INTO users VALUES(?,?,?)').run(id,'active',now);cookies[id]=`__Host-mywallet-session=${(await createSession(db,id)).token}`;}
 auth.prepare('INSERT INTO ledgers VALUES(?,?,?,?)').run(ledger,owner,'Personal',now);auth.prepare('INSERT INTO ledger_memberships VALUES(?,?,?,?)').run(ledger,owner,'owner',now);
 personal.exec('CREATE TABLE memoney_test_database(id TEXT PRIMARY KEY,ledger_id TEXT)');personal.prepare('INSERT INTO memoney_test_database VALUES(?,?)').run('memoney-android-test-personal',ledger);
 personal.prepare('INSERT INTO assets(id,category,amount,memo,name) VALUES(?,?,?,?,?)').run('cash','bank',100,'메모','현금');
 personal.prepare('INSERT INTO transactions(id,type,date,amount,title,category,asset_id,transaction_time) VALUES(?,?,?,?,?,?,?,?)').run('t','income','2026-10-21',100,'수입','salary','cash','09:12');
 personal.prepare('INSERT INTO recurring_rules(id,type,day,amount,title,category,startMonth,transaction_time) VALUES(?,?,?,?,?,?,?,?)').run('r','expense',1,10,'정기','food','2026-11','10:00');
 personal.prepare('INSERT INTO deleted_recurring_txs VALUES(?)').run('rec_r_2026-12');personal.prepare('INSERT INTO settings VALUES(?,?)').run('categoryLabels','{"food":"식비"}');
 personal.prepare('INSERT INTO plans VALUES(?,?,?)').run('food','expense',99);personal.prepare('INSERT INTO custom_categories(id,type,label,color) VALUES(?,?,?,?)').run('custom','asset','자산','#123456');
 personal.prepare('INSERT INTO card_settlements VALUES(?,?,?,?,?,?,?,?,?)').run('settlement','card','cash','2026-09-01','2026-09-30','2026-10-21',100,'t',now);
 personal.prepare('INSERT INTO sync_groups VALUES(?,?)').run('asset-order:bank',3);
 personal.prepare('INSERT INTO operation_results(operation_id,entity_type,entity_id,status,response_json,created_at) VALUES(?,?,?,?,?,?)').run('old-operation','transaction','t','success','{}',now);
 personal.prepare('INSERT INTO sync_changes(entity_type,entity_id,change_type,revision,payload_json,created_at) VALUES(?,?,?,?,?,?)').run('transaction','t','upsert',2,'{"title":"수입"}',now);
 const env={DB:db,TEST_FINANCE:pdb,TEST_SHARED_FINANCE:sdb,AUTH_ENABLED:'true',AUTH_GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',AUTH_ORIGIN:'https://memoney-android-test.pages.dev',AUTH_SHARED_TEST_DEPLOYMENT:'true',AUTH_TEST_PERSONAL_LEDGER:'true',AUTH_TEST_MULTI_LEDGER:'true',AUTH_LEDGER_INVITES:'true',AUTH_SHARED_WALLET_LEDGER_ID:ledger,AUTH_LEDGER_RECOVERY:'true'};
 const req=(body,user=owner,id=ledger,method=body?'POST':'GET',generation)=>new Request(env.AUTH_ORIGIN+'/api/wallet/recovery',{method,headers:{Cookie:cookies[user],Origin:env.AUTH_ORIGIN,'Content-Type':'application/json','X-Memoney-Ledger':id,...(generation?{'X-Memoney-Generation':generation}:{})},body:body?JSON.stringify(body):undefined});
 const info=async(id=ledger)=>{const r=await handleRecovery(req(null,owner,id),env);assert.equal(r.status,200,await r.clone().text());return r.json();};
 const act=async(action,id=ledger,recoveryId)=>{const i=await info(id);const body={action,operationId:randomUUID(),generation:i.generation,version:i.version,recoveryId};const response=await handleRecovery(req(body,owner,id),env);return {body,response};};
 return {auth,personal,shared,owner,guest,ledger,env,req,info,act,close(){auth.close();personal.close();shared.close();}};
}

test('web and Android share users, ledger UUIDs, revisions, reset and restore without an unscoped route',async()=>{
 const f=await fixture();try {
  const webEnv={...f.env,AUTH_SHARED_TEST_DEPLOYMENT:undefined,AUTH_ANDROID_DATA_COMPAT:'true',AUTH_ORIGIN:'https://mywallet-8mx.pages.dev'};
  // Independent browser sessions, same verified account and authoritative stores.
  const webCookie=`__Host-mywallet-session=${(await createSession(f.env.DB,f.owner)).token}`;
  const request=(path='/api/data',body,method=body?'PATCH':'GET',generation)=>new Request(webEnv.AUTH_ORIGIN+path,{method,headers:{Cookie:webCookie,Origin:webEnv.AUTH_ORIGIN,'Content-Type':'application/json','X-Memoney-Ledger':f.ledger,...(generation?{'X-Memoney-Generation':generation}:{})},body:body?JSON.stringify(body):undefined});
  const context=await sharedWalletContext(request('/api/wallet/context'),webEnv);assert.equal(context.status,200);
  const ctx=await context.json();assert.equal(ctx.user.id,f.owner);assert.equal(ctx.ledger.id,f.ledger);
  const mutation={op:'transaction.update',operationId:randomUUID(),expectedRevision:1,transaction:{id:'t',type:'income',date:'2026-10-21',amount:321,title:'cross-client',category:'salary',assetId:'cash',time:'09:12'}};
  assert.equal((await webPatch({request:request('/api/data',mutation),env:webEnv})).status,200);
  const nativeRead=await sharedWalletData(f.req(null,f.owner,f.ledger,'GET'),f.env);assert.equal((await nativeRead.json()).transactions[0].amount,321);
  const stale={...mutation,operationId:randomUUID()};assert.equal((await sharedWalletData(f.req(stale,f.owner,f.ledger,'PATCH'),f.env)).status,409);
  const i=await (await handleRecovery(request('/api/wallet/recovery'),webEnv)).json();
  const reset={action:'reset',operationId:randomUUID(),generation:i.generation,version:i.version};
  const resetResponse=await handleRecovery(request('/api/wallet/recovery',reset,'POST'),webEnv);assert.equal(resetResponse.status,200);const r=await resetResponse.json();
  assert.equal((await sharedWalletData(f.req({...mutation,operationId:randomUUID()},f.owner,f.ledger,'PATCH'),f.env)).status,409);
  const after=await (await handleRecovery(request('/api/wallet/recovery'),webEnv)).json();
  const restored=await handleRecovery(request('/api/wallet/recovery',{action:'restore',operationId:randomUUID(),generation:r.generation,version:after.version,recoveryId:reset.operationId},'POST'),webEnv);assert.equal(restored.status,200);
  const fresh=await webGet({request:request(),env:webEnv});assert.equal((await fresh.json()).transactions[0].amount,321);
  assert.equal((await webPost({request:request('/api/data',{},'POST'),env:webEnv})).status,405);
  assert.equal((await sharedWalletContext(request('/api/wallet/context'),{...webEnv,AUTH_ORIGIN:'https://foreign.invalid'})).status,503);
  assert.equal((await webGet({request:new Request(webEnv.AUTH_ORIGIN+'/api/data'),env:{DB:f.env.DB}})).status,503);
 }finally{f.close();}
});
test('reset and restore round-trip every column; new records are preserved before restoration; retries are idempotent',async()=>{const f=await fixture();try{
 const before=await capture(f.env.TEST_FINANCE,await snapshotLayout(f.env.TEST_FINANCE));
 const reset=await f.act('reset');assert.equal(reset.response.status,200,await reset.response.clone().text());const result=await reset.response.json();
 assert.equal(f.personal.prepare('SELECT COUNT(*) n FROM transactions').get().n,0);
 assert.equal((await handleRecovery(f.req(reset.body),f.env)).status,200);
 assert.equal((await sharedWalletData(f.req({op:'setting.set',key:'budget',value:10},f.owner,f.ledger,'PATCH','initial'),f.env)).status,409);
 const db=generationDatabase(f.env.TEST_FINANCE,f.ledger,result.generation);await db.prepare("INSERT INTO assets(id,category,amount,memo,name) VALUES('new','bank',0,'','New')").run();
 const restore=await f.act('restore',f.ledger,result.archiveId);assert.equal(restore.response.status,200,await restore.response.clone().text());const restored=await restore.response.json();
 const after=await capture(f.env.TEST_FINANCE,await snapshotLayout(f.env.TEST_FINANCE));const expected=JSON.parse(before.json),actual=JSON.parse(after.json);expected.settings=expected.settings.filter(s=>s.key!=='updatedAt');actual.settings=actual.settings.filter(s=>s.key!=='updatedAt');assert.deepEqual(actual,expected);
 const safety=f.personal.prepare('SELECT snapshot_json FROM memoney_recoveries WHERE id=?').get(restored.archiveId);assert(JSON.parse(safety.snapshot_json).assets.some(a=>a.id==='new'));
 assert.equal((await handleRecovery(f.req(restore.body),f.env)).status,200);
 await assert.rejects(()=>db.prepare("INSERT INTO settings VALUES('late','1')").run());
 assert.equal((await sharedWalletData(f.req(null,f.owner,f.ledger,'GET'),f.env)).headers.get('X-Memoney-Generation'),restored.generation);
}finally{f.close();}});
test('backup failure, stale version, owner checks, origin and reauthentication fail before clearing data',async()=>{const f=await fixture();try{
 const i=await f.info(),body={action:'reset',operationId:randomUUID(),generation:i.generation,version:i.version};
 f.personal.prepare('INSERT INTO settings VALUES(?,?)').run('changed','yes');assert.equal((await handleRecovery(f.req(body),f.env)).status,409);
 assert.equal((await handleRecovery(f.req(body,f.guest),f.env)).status,403);
 const cross=f.req(body);cross.headers.set('Origin','https://evil.example');assert.equal((await handleRecovery(cross,f.env)).status,403);
 f.auth.prepare('UPDATE auth_sessions SET created_at=?').run(Date.now()-16*60*1000);assert.equal((await handleRecovery(f.req(body),f.env)).status,409);
 f.auth.prepare('UPDATE auth_sessions SET created_at=?').run(Date.now());
 f.personal.exec("CREATE TRIGGER fail_backup BEFORE INSERT ON memoney_recoveries BEGIN SELECT RAISE(ABORT,'full'); END");
 assert.equal((await f.act('reset')).response.status,409);assert.equal(f.personal.prepare('SELECT COUNT(*) n FROM transactions').get().n,1);assert.equal(f.personal.prepare('SELECT generation FROM memoney_recovery_state').get().generation,'initial');
}finally{f.close();}});
test('atomic generation guard rolls back an entire stale batch',async()=>{const f=await fixture();try{
 await recoveryState(f.env.TEST_FINANCE,f.ledger);const old=generationDatabase(f.env.TEST_FINANCE,f.ledger,'initial');
 await f.act('reset');await assert.rejects(()=>old.batch([old.prepare("INSERT INTO settings VALUES('bad','1')"),old.prepare("INSERT INTO settings VALUES('worse','2')")]));
 assert.equal(f.personal.prepare("SELECT COUNT(*) n FROM settings WHERE key IN ('bad','worse')").get().n,0);
}finally{f.close();}});
test('shared archive keeps UUID/memberships, blocks everyone, restores, respects exact UTC expiry and owner slot',async()=>{const f=await fixture();try{
 const initial={action:'create',name:'우리 장부',source:'personal',operationId:randomUUID()};let job=(await (await handleLedgers(f.req(initial),f.env)).json()).creation;
 while(job.status!=='ready')job=(await (await handleLedgers(f.req({action:'continue',ledgerId:job.id}),f.env)).json()).creation;
 f.auth.prepare('INSERT INTO ledger_memberships VALUES(?,?,?,?)').run(job.id,f.guest,'editor',Date.now());
 const a=await f.act('archive',job.id);assert.equal(a.response.status,200,await a.response.clone().text());const archived=await a.response.json();
 assert.equal((await sharedWalletData(f.req(null,f.guest,job.id,'GET'),f.env)).status,423);
 assert.equal((await handleRecovery(f.req(null,f.guest,job.id),f.env)).status,403);
 assert.equal((await handleLedgers(f.req({...initial,operationId:randomUUID()}),f.env)).status,409);
 assert.equal((await f.act('restore',job.id,archived.archiveId)).response.status,200);
 assert.equal((await sharedWalletData(f.req(null,f.guest,job.id,'GET'),f.env)).status,200);
 const b=await f.act('archive',job.id),data=await b.response.json(),info=await f.info(job.id),body={action:'restore',operationId:randomUUID(),recoveryId:data.archiveId,generation:info.generation,version:info.version};
 f.shared.prepare('UPDATE memoney_recoveries SET expires_at=? WHERE id=?').run(Date.now(),data.archiveId);
 assert.equal((await handleRecovery(f.req(body,f.owner,job.id),f.env)).status,410);
 f.shared.prepare('UPDATE memoney_recovery_state SET expires_at=? WHERE ledger_id=?').run(Date.now(),job.id);
 await purgeRecoveries(f.env.TEST_SHARED_FINANCE,true);
 assert.equal((await scopedFinance(f.env.TEST_SHARED_FINANCE,job.id).prepare('SELECT COUNT(*) n FROM transactions').first()).n,0);
 assert.equal(f.auth.prepare('SELECT COUNT(*) n FROM ledger_memberships WHERE ledger_id=?').get(job.id).n,2);
 await retireExpiredShared(f.env.TEST_SHARED_FINANCE,f.env.DB);assert.equal(f.auth.prepare('SELECT COUNT(*) n FROM created_shared_ledgers WHERE ledger_id=?').get(job.id).n,0);
 const next=await handleLedgers(f.req({...initial,source:'empty',operationId:randomUUID()}),f.env);assert.equal(next.status,200);
 assert.equal(f.shared.prepare('SELECT status FROM memoney_recovery_state WHERE ledger_id=?').get(job.id).status,'retired');assert.equal(data.expiresAt-(JSON.parse(f.shared.prepare('SELECT result_json FROM memoney_recoveries WHERE id=?').get(data.archiveId).result_json).expiresAt-retention),retention);
}finally{f.close();}});
test('exact seven-day boundary, corruption, large snapshots and operation reuse fail closed',async()=>{const f=await fixture();try{
 const reset=await f.act('reset'),a=await reset.response.json(),i=await f.info();
 const created=f.personal.prepare('SELECT created_at,expires_at FROM memoney_recoveries WHERE id=?').get(a.archiveId);assert.equal(created.expires_at-created.created_at,retention);
 const body={action:'restore',operationId:randomUUID(),recoveryId:a.archiveId,generation:i.generation,version:i.version};
 const deadline=Date.now()+100;f.personal.prepare('UPDATE memoney_recoveries SET expires_at=? WHERE id=?').run(deadline,a.archiveId);
 assert.equal((await handleRecovery(f.req(body),f.env,deadline)).status,410);
 f.personal.prepare('UPDATE memoney_recoveries SET expires_at=?,snapshot_json=? WHERE id=?').run(Date.now()+retention,'{}',a.archiveId);
 assert.equal((await handleRecovery(f.req(body),f.env)).status,409);
 assert.equal(f.personal.prepare('SELECT COUNT(*) n FROM transactions').get().n,0);
 assert.equal((await handleRecovery(f.req({...reset.body,action:'restore',recoveryId:a.archiveId}),f.env)).status,409);
 f.personal.prepare('INSERT INTO settings VALUES(?,?)').run('large','x'.repeat(1_510_000));
 assert.equal((await handleRecovery(f.req(null),f.env)).status,503);assert.equal(f.personal.prepare('SELECT length(value) n FROM settings WHERE key=?').get('large').n,1_510_000);
}finally{f.close();}});
test('concurrent restore requests commit only one generation and one safety copy',async()=>{const f=await fixture();try{
 const reset=await f.act('reset'),saved=await reset.response.json(),info=await f.info();
 const body={action:'restore',recoveryId:saved.archiveId,generation:info.generation,version:info.version};
 const results=await Promise.all([1,2].map(()=>handleRecovery(f.req({...body,operationId:randomUUID()}),f.env)));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(f.personal.prepare('SELECT COUNT(*) n FROM transactions').get().n,1);
 assert.equal(f.personal.prepare("SELECT COUNT(*) n FROM memoney_recoveries WHERE kind='before-restore'").get().n,1);
}finally{f.close();}});
