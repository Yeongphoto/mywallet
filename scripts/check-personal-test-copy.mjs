import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const source=new DatabaseSync(':memory:'), target=new DatabaseSync(':memory:');
source.exec(readFileSync('android/build/web-finance-readonly-20261014.sql','utf8'));
target.exec(readFileSync('android/build/personal-test-verified-copy.sql','utf8'));
const tables=source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
const counts={};
try {
  for(const {name} of tables) {
    assert(/^[a-z_]+$/.test(name));
    const rows=db=>db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all().map(row=>JSON.stringify(row)).sort();
    const original=rows(source), copy=rows(target);assert.deepEqual(copy,original,`${name}: all columns and rows must match`);
    counts[name]=copy.length;
  }
  const marker=target.prepare('SELECT id FROM memoney_test_database').get();assert.equal(marker.id,'memoney-android-test-personal');
  const result={allTablesMatch:true,allColumnsMatch:true,counts};
  writeFileSync('android/build/personal-test-copy-check.json',JSON.stringify(result,null,2)+'\n','utf8');
  console.log(JSON.stringify(result));
} finally {source.close();target.close();}
