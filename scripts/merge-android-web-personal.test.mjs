import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {buildMerge} from './merge-android-web-personal.mjs';
function fixture(){const web=new DatabaseSync(':memory:'),android=new DatabaseSync(':memory:');for(const db of [web,android])db.exec(readFileSync(new URL('android-sandbox-schema.sql',import.meta.url),'utf8'));
  web.exec("INSERT INTO transactions(id,type,date,amount,title,category,revision,last_operation_id) VALUES('web-only','expense','2026-10-18',100,'fixture','food',1,'web-op'); INSERT INTO operation_results(operation_id,entity_type,entity_id,status,response_json,created_at,request_hash) VALUES('web-op','transaction','web-only','success','{}',1,'hash');");
  return{web,android,close(){web.close();android.close();}};}
test('additive merge is repeatable, retains source revision, and appends a fresh cursor',()=>{const f=fixture();try{
  f.android.exec("INSERT INTO sync_changes(cursor,entity_type,entity_id,change_type,created_at) VALUES(99,'transaction','other','delete',1)");
  const {sql}=buildMerge(f.web,f.android,1234);f.android.exec(sql);f.android.exec(sql);
  assert.equal(f.android.prepare('SELECT COUNT(*) n FROM transactions').get().n,1);
  assert.equal(f.android.prepare('SELECT MAX(cursor) n FROM sync_changes').get().n,100);
  assert.equal(f.android.prepare("SELECT revision FROM transactions WHERE id='web-only'").get().revision,1);
  assert.equal(f.android.prepare('SELECT COUNT(*) n FROM operation_results').get().n,1);
}finally{f.close();}});
test('changed shared IDs, unexpected scope, tombstones and operation collisions stop the plan',()=>{const f=fixture();try{
  f.android.exec("INSERT INTO transactions(id,type,date,amount,title,category) VALUES('web-only','expense','2026-10-18',999,'changed','food')");
  assert.throws(()=>buildMerge(f.web,f.android),/conflict/);
  f.android.exec('DELETE FROM transactions');f.web.exec("UPDATE transactions SET deleted_at=1");assert.throws(()=>buildMerge(f.web,f.android),/active/);
  f.web.exec("UPDATE transactions SET deleted_at=NULL");f.android.exec("INSERT INTO operation_results(operation_id,entity_type,entity_id,status,response_json,created_at) VALUES('web-op','transaction','other','success','{}',1)");
  assert.throws(()=>buildMerge(f.web,f.android),/Operation history/);
}finally{f.close();}});
