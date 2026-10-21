import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {dueRecurringTransactions,dateInTimeZone} from '../src/recurring.ts';
import {onRequestGet,onRequestPatch} from '../functions/api/data.ts';
import {localSnapshot,localWalletFetch} from '../src/auth/local-wallet.ts';
import {recoveryState,generationDatabase} from '../server/wallet/recovery-store.ts';

const rule=(id='rule-21',day=21,startMonth='2026-10')=>({id,type:'expense',day,startMonth,endMonth:null,title:'Phone fixture',category:'phone',amount:100,assetId:'cash',time:'09:13'});
const storage=()=>{const rows=new Map();return {getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v)};};
test('same title and amount never relabel another rules initial payment; the genuine due occurrence remains due',()=>{
 const old=rule(),next=rule('rule-19',19,'2026-11'),paid={id:'rec_rule-19_2026-10',date:'2026-10-19',recurringRuleId:next.id};
 const before=structuredClone(paid),due=dueRecurringTransactions([old,next],[paid],[],'2026-10-21');
 assert.equal(due.length,1);assert.equal(due[0].id,'rec_rule-21_2026-10');assert.equal(due[0].date,'2026-10-21');assert.deepEqual(paid,before);
 // Approved repair: suppress the old October occurrence and stop the old schedule.
 old.endMonth='2026-10';
 assert.deepEqual(dueRecurringTransactions([old,next],[paid],['rec_rule-21_2026-10'],'2026-10-21'),[]);
 const november=dueRecurringTransactions([old,next],[paid],['rec_rule-21_2026-10'],'2026-11-19');
 assert.equal(november.length,1);assert.equal(november[0].date,'2026-11-19');assert.equal(november[0].recurringRuleId,next.id);
});
test('month-end, leap year, future dates, stop month, deletion and preserved legacy IDs follow documented rules',()=>{
 const r=rule('month-end',31,'2024-02');
 assert.equal(dueRecurringTransactions([r],[],[],'2024-02-28').length,0);
 assert.equal(dueRecurringTransactions([r],[],[],'2024-02-29')[0].date,'2024-02-29');
 r.startMonth='2025-02';assert.equal(dueRecurringTransactions([r],[],[],'2025-02-28')[0].date,'2025-02-28');
 r.endMonth='2025-02';assert.equal(dueRecurringTransactions([r],[],[],'2025-03-31').length,1);
 assert.equal(dueRecurringTransactions([r],[],['rec_month-end_2025-02'],'2025-03-31').length,0);
 const paid={id:'preserved-manual-uuid',date:'2025-02-27',recurringRuleId:r.id};
 assert.equal(dueRecurringTransactions([r],[paid],[],'2025-03-31').length,0);assert.equal(paid.id,'preserved-manual-uuid');
 assert.equal(dateInTimeZone('Asia/Seoul',new Date('2026-10-20T15:01:00Z')),'2026-10-21');
});
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('scripts/android-sandbox-schema.sql','utf8'));
 const db={before:null,fail:null,prepare(query){return {query,values:[],bind(...values){this.values=values;return this;},async first(){return sql.prepare(query).get(...this.values)||null;},async all(){return {results:sql.prepare(query).all(...this.values)};},async run(){return {meta:{changes:sql.prepare(query).run(...this.values).changes}};}};},async batch(items){if(db.before)await db.before(items);sql.exec('BEGIN');try{const result=items.map(s=>{if(db.fail?.(s.query))throw Error('injected');const q=sql.prepare(s.query);return q.columns().length?{results:q.all(...s.values),meta:{changes:0}}:{meta:{changes:q.run(...s.values).changes}};});sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 const patch=async body=>onRequestPatch({env:{DB:db},request:new Request('https://fixture/api/data',{method:'PATCH',body:JSON.stringify(body)})});
 const read=async()=>{const response=await onRequestGet({env:{DB:db},request:new Request('https://fixture/api/data')});assert.equal(response.status,200);return response.json();};
 const today=dateInTimeZone('Asia/Seoul'),currentRule=rule('due-today',Number(today.slice(8)),today.slice(0,7));
 return {sql,db,patch,read,today,currentRule,close:()=>sql.close()};
}
test('generation is persisted atomically, visible after reload, shared by two clients and produces one delta',async()=>{
 const f=fixture();try{
  assert.equal((await f.patch({op:'recurring_rule.create',rule:f.currentRule})).status,200);
  assert.equal((await f.read()).recurringRules[0].time,'09:13');assert.equal((await f.read()).transactions.length,0,'GET never materializes data');
  const responses=await Promise.all([f.patch({op:'recurring.generate',timeZone:'Asia/Seoul'}),f.patch({op:'recurring.generate',timeZone:'Asia/Seoul'})]);
  for(const response of responses)assert.equal(response.status,200,await response.clone().text());
  const data=await f.read();assert.equal(data.transactions.length,1);assert.equal(data.transactions[0].time,'09:13');assert.equal(data.transactions[0].date,f.today);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,1);
  const stamp=f.sql.prepare("SELECT value FROM settings WHERE key='updatedAt'").get().value;
  assert.equal((await (await f.patch({op:'recurring.generate',timeZone:'Asia/Seoul'})).json()).generated,0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,1);assert.equal(f.sql.prepare("SELECT value FROM settings WHERE key='updatedAt'").get().value,stamp);
  await f.patch({op:'recurring_rule.update',rule:{...f.currentRule,time:'18:45'}});assert.equal((await f.read()).recurringRules[0].time,'18:45');assert.equal((await f.read()).transactions[0].time,'09:13','existing payment is preserved');
 }finally{f.close();}
});
test('generation retries after a lost response, tombstones and changed rows never duplicate or overwrite',async()=>{
 const f=fixture();try{
  await f.patch({op:'recurring_rule.create',rule:f.currentRule});await f.patch({op:'recurring.generate',timeZone:'Asia/Seoul'});
  const t=(await f.read()).transactions[0];
  await f.patch({op:'transaction.update',operationId:randomUUID(),expectedRevision:1,transaction:{...t,amount:222}});
  await f.patch({op:'recurring.generate',timeZone:'Asia/Seoul'});assert.equal((await f.read()).transactions[0].amount,222);
  await f.patch({op:'recurring_tx.delete',id:t.id});await f.patch({op:'recurring.generate',timeZone:'Asia/Seoul'});
  assert.equal((await f.read()).transactions.length,0);assert((await f.read()).deletedRecurringTxs.includes(t.id));
 }finally{f.close();}
});
test('database failure rolls back occurrence, sync delta and updatedAt; retry succeeds',async()=>{
 const f=fixture();try{
  await f.patch({op:'recurring_rule.create',rule:f.currentRule});f.db.fail=query=>query.startsWith('INSERT INTO sync_changes');
  assert.equal((await f.patch({op:'recurring.generate',timeZone:'Asia/Seoul'})).status,500);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM transactions').get().n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,0);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM settings WHERE key='updatedAt'").get().n,0);
  f.db.fail=null;assert.equal((await f.patch({op:'recurring.generate',timeZone:'Asia/Seoul'})).status,200);assert.equal((await f.read()).transactions.length,1);
 }finally{f.close();}
});
test('a stop, deletion or generation change between read and commit prevents stale creation',async()=>{
 for(const change of ['stop','delete','generation']){
  const f=fixture();try{
   await f.patch({op:'recurring_rule.create',rule:f.currentRule});const ledger=randomUUID();await recoveryState(f.db,ledger);
   const guarded=generationDatabase(f.db,ledger,'initial');
   f.db.before=async items=>{if(!items.some(s=>s.query?.includes('SELECT ?,r.type')))return;f.db.before=null;
    if(change==='stop')f.sql.prepare("UPDATE recurring_rules SET endMonth='2000-01'").run();
    else if(change==='delete')f.sql.prepare('INSERT INTO deleted_recurring_txs VALUES(?)').run(`rec_${f.currentRule.id}_${f.today.slice(0,7)}`);
    else f.sql.prepare("UPDATE memoney_recovery_state SET generation='next' WHERE ledger_id=?").run(ledger);
   };
   const response=await onRequestPatch({env:{DB:guarded},request:new Request('https://fixture/api/data',{method:'PATCH',body:JSON.stringify({op:'recurring.generate',timeZone:'Asia/Seoul'})})});
   assert.equal(response.status,change==='generation'?500:200);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM transactions').get().n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,0);
  }finally{f.close();}
 }
});
test('device-local generation persists once without network and invalid timezone/future client dates do not create future rows',async()=>{
 const s=storage(),id=randomUUID(),f=fixture();try{
  const call=body=>localWalletFetch(id,'/api/data',{method:'PATCH',body:JSON.stringify(body)},s);
  await call({op:'recurring_rule.create',rule:f.currentRule});const body={op:'recurring.generate',timeZone:'Asia/Seoul'};
  assert.equal((await (await call(body)).json()).generated,1);assert.equal((await (await call(body)).json()).generated,0);assert.equal(localSnapshot(s,id).transactions.length,1);
  assert.equal((await call({...body,timeZone:'invalid-zone'})).status,400);assert.equal((await f.patch({...body,timeZone:'invalid-zone'})).status,400);
  await f.patch({op:'recurring_rule.create',rule:{...f.currentRule,startMonth:'2099-01'}});
  assert.equal((await (await f.patch({...body,throughDate:'2099-12-31'})).json()).generated,0);
 }finally{f.close();}
});
